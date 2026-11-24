import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/condition_parts.dart';
import '../../core/format.dart';
import '../../core/listing_validation.dart';
import '../../core/network/api_exception.dart';
import '../../models/ai_result.dart';
import '../../providers/ai_providers.dart';
import '../../providers/auth_controller.dart';
import '../../models/geo_place.dart';
import '../../models/listing_input.dart';
import '../../providers/listings_controller.dart';
import '../../providers/location_providers.dart';
import '../../providers/photo_providers.dart';
import '../../routes/route_paths.dart';
import '../../services/location_service.dart';
import '../../services/photo_picker.dart';
import '../../widgets/ai_cards.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/app_text_field.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/loading_button.dart';
import '../../widgets/location_field.dart';
import '../../widgets/message_banner.dart';

/// List a device on one scrolling page: photos first (with a small AI help button under them), then the device, then what you
/// want done with it. Nothing is hidden behind a Next button; publishing checks the whole page and scrolls to the first problem.
class NewListingScreen extends ConsumerStatefulWidget {
  const NewListingScreen({super.key});

  @override
  ConsumerState<NewListingScreen> createState() => _NewListingScreenState();
}

class _NewListingScreenState extends ConsumerState<NewListingScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _brand = TextEditingController();
  final _model = TextEditingController();
  final _modelYear = TextEditingController();
  final _year = TextEditingController();
  final _price = TextEditingController();
  final _city = TextEditingController();
  final _area = TextEditingController();
  final _agentPhone = TextEditingController();

  final List<PickedPhoto> _photos = [];
  GeoPoint? _where;
  bool _showAi = false;
  final _scroll = ScrollController();

  // One key per section, so a problem can scroll the page to it.
  final _sections = {for (final name in _sectionOrder) name: GlobalKey()};
  static const _sectionOrder = [
    'photos',
    'basics',
    'age',
    'condition',
    'service',
    'price',
    'handover',
    'where',
    'protect'
  ];
  String _category = '';
  String _condition = '';

  // How each part is doing (optional): part key -> chosen value.
  final Map<String, String> _details = {};
  bool _showMoreParts = false;

  // A price the AI expects for this device, asked for when the person reaches the price step.
  PriceRange? _priceRange;
  bool _priceBusy = false;
  bool _priceAsked = false;
  String _service = '';
  String _pickup = 'either';

  // Messages for the choice groups (chips), which are not form fields.
  final Map<String, String> _choiceErrors = {};
  final List<bool> _checks =
      List<bool>.filled(dataProtectionChecklist.length, false);
  Map<String, String> _serverErrors = const {};
  String? _banner;
  String? _photoNote;
  bool _busy = false;
  double? _progress;

  @override
  void initState() {
    super.initState();
    // The phone number from the person's profile, when it is a valid Indian mobile number.
    final fromProfile =
        normalizePhone(ref.read(authControllerProvider).user?.phone);
    if (RegExp(r'^[6-9]\d{9}$').hasMatch(fromProfile))
      _agentPhone.text = fromProfile;
  }

  @override
  void dispose() {
    _scroll.dispose();
    for (final c in [
      _name,
      _brand,
      _model,
      _modelYear,
      _year,
      _price,
      _city,
      _area,
      _agentPhone
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  // ---- photos ----

  void _addPhotos(List<PickedPhoto> picked) {
    final notes = <String>[];
    setState(() {
      for (final p in picked) {
        if (_photos.length >= maxPhotos) {
          notes.add('You can add up to $maxPhotos photos.');
          break;
        }
        final problem = photoProblem(mime: p.mime, bytes: p.bytes);
        if (problem != null) {
          notes.add('${p.name}: $problem');
        } else {
          _photos.add(p);
        }
      }
      _photoNote = notes.isEmpty ? null : notes.toSet().join('\n');
    });
  }

  Future<void> _pick(Future<List<PickedPhoto>> Function() action) async {
    setState(() => _photoNote = null);
    try {
      _addPhotos(await action());
    } on PlatformException {
      // Camera or gallery denied or unavailable.
      if (mounted)
        setState(() => _photoNote =
            'Could not open that. Check that the app is allowed to use the camera and photos, or try the other option.');
    }
  }

  Future<void> _camera() => _pick(() async {
        final photo = await ref.read(photoPickerProvider).takePhoto();
        return photo == null ? const <PickedPhoto>[] : [photo];
      });

  Future<void> _gallery() => _pick(() => ref
      .read(photoPickerProvider)
      .choosePhotos(limit: maxPhotos - _photos.length));

  /// The answers for the parts asked about for the chosen category: an answer left over from another category is not sent.
  Map<String, String> _answeredDetails() {
    final asked = conditionPartsFor(_category.isEmpty ? null : _category)
        .map((p) => p.key);
    return {
      for (final e in _details.entries)
        if (asked.contains(e.key) && e.value.isNotEmpty) e.key: e.value
    };
  }

  /// Chips for one part. Tapping the chosen answer again takes it back.
  Widget _partGroup(ConditionPart part, {bool required = false}) {
    final theme = Theme.of(context);
    final error = _choiceErrors['part_${part.key}'];
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
              header: true,
              child: Text(required ? '${part.label} *' : part.label,
                  style: theme.textTheme.titleMedium?.copyWith(fontSize: 15))),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: [
            for (final (value, label) in part.options)
              AppChip(
                label: label,
                selected: _details[part.key] == value,
                onTap: () => setState(() {
                  _details[part.key] == value
                      ? _details.remove(part.key)
                      : _details[part.key] = value;
                  _choiceErrors.remove('part_${part.key}');
                }),
              ),
          ]),
          if (error != null)
            Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(error,
                    style: TextStyle(
                        color: theme.colorScheme.error, fontSize: 13))),
        ],
      ),
    );
  }

  /// Asks the AI what this device is worth, from the photos and what has been filled in. Optional: nothing breaks when it cannot say.
  Future<void> _askPrice() async {
    setState(() {
      _priceAsked = true;
      _priceBusy = true;
    });
    final rows =
        conditionRows(_answeredDetails()).map((r) => '${r.$1}: ${r.$2}');
    final words = [
      _name.text,
      _brand.text,
      _model.text,
      if (_condition.isNotEmpty)
        'Condition: ${labelOf(conditions, _condition)}',
      ...rows
    ].where((s) => s.trim().isNotEmpty).join('. ');
    PriceRange? range;
    try {
      range = (await ref
              .read(aiRepositoryProvider)
              .analyzeDevice(_photos, text: words))
          .resale;
    } on ApiException {
      range = null;
    }
    if (!mounted) return;
    setState(() {
      _priceRange = range;
      _priceBusy = false;
    });
  }

  /// Under the price box: what the AI expects, with a button to use the middle of it.
  Widget _priceHint() {
    final theme = Theme.of(context);
    final range = _priceRange;
    if (_priceBusy)
      return Text('Asking the AI what this device is worth…',
          style: theme.textTheme.bodyMedium);
    if (range != null) {
      final mid = ((range.min + range.max) / 2 / 100).round() * 100;
      return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(
            'AI expects about ${formatPrice(range.min)} to ${formatPrice(range.max)} (a rough estimate).',
            style: theme.textTheme.bodyMedium),
        TextButton(
            onPressed: () => setState(() => _price.text = '$mid'),
            child: Text('Use ${formatPrice(mid)}')),
      ]);
    }
    return Row(children: [
      Expanded(
          child: Text(
              _priceAsked
                  ? 'The AI could not suggest a price just now. Leave it empty for "price on request", or 0 to give it away.'
                  : 'Leave it empty for "price on request", or 0 to give it away.',
              style: theme.textTheme.bodyMedium)),
      TextButton(onPressed: _askPrice, child: const Text('Ask the AI')),
    ]);
  }

  // ---- AI help ----

  String _wordsSoFar() => [_name.text, _brand.text, _model.text]
      .where((s) => s.trim().isNotEmpty)
      .join('. ');

  /// Fills the form from an AI suggestion the person just accepted.
  void _applyAi(AiResult r) {
    setState(() {
      if ((r.title ?? '').isNotEmpty) _name.text = r.title!;
      if ((r.brand ?? '').isNotEmpty) _brand.text = r.brand!;
      if ((r.model ?? '').isNotEmpty) _model.text = r.model!;
      if (r.categorySlug != null) _category = r.categorySlug!;
      if (r.condition != null && conditions.any((c) => c.$1 == r.condition))
        _condition = r.condition!;
      if (listableServices.contains(r.recommendation))
        _service = r.recommendation;
      _choiceErrors.clear();
      _showAi = false;
    });
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Filled in from the suggestion. Check it below.')));
  }

  // ---- the whole page ----

  /// The sections that have something wrong, in the order they appear on the page.
  List<String> _problemSections() {
    final bad = <String>{};
    if (_photos.isEmpty) bad.add('photos');
    if (validateDeviceName(_name.text) != null ||
        _category.isEmpty ||
        validateBrand(_brand.text) != null ||
        validateModel(_model.text) != null) bad.add('basics');
    if (validateModelYear(_modelYear.text) != null ||
        validatePurchaseYear(_year.text, modelYear: _modelYear.text) != null)
      bad.add('age');
    final missingPart = requiredPartsFor(_category.isEmpty ? null : _category)
        .any((p) => (_details[p.key] ?? '').isEmpty);
    if (_condition.isEmpty || missingPart) bad.add('condition');
    if (_service.isEmpty) bad.add('service');
    if (validateExpectedPrice(_price.text) != null) bad.add('price');
    if (validateCity(_city.text) != null ||
        validateArea(_area.text) != null ||
        validateAgentPhone(_agentPhone.text) != null) bad.add('where');
    if (!_checks.every((c) => c)) bad.add('protect');
    return [
      for (final name in _sectionOrder)
        if (bad.contains(name)) name
    ];
  }

  /// Brings a section into view (below the app bar), so the person sees what needs fixing.
  void _scrollTo(String section) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final context = _sections[section]?.currentContext;
      if (context != null && context.mounted)
        Scrollable.ensureVisible(context,
            duration: const Duration(milliseconds: 350),
            curve: Curves.easeOutCubic,
            alignment: 0.05);
    });
  }

  /// Checks everything. Shows what is wrong, scrolls to the first problem and answers false; true when the page is complete.
  bool _validateAll() {
    final formOk = _formKey.currentState?.validate() ?? true;
    final errors = <String, String>{};
    if (_category.isEmpty) errors['category'] = 'Choose a category';
    if (_condition.isEmpty) errors['condition'] = 'Choose the condition';
    // Battery, screen, ports and buttons, and water damage, for the categories that have them.
    for (final part in requiredPartsFor(_category.isEmpty ? null : _category)) {
      if ((_details[part.key] ?? '').isEmpty)
        errors['part_${part.key}'] =
            'Choose the ${part.label.toLowerCase()} condition';
    }
    if (_service.isEmpty)
      errors['service'] = 'Choose what you want to do with it';
    // Every data-protection box must be ticked before a device can be saved or published.
    if (!_checks.every((c) => c))
      errors['checklist'] = 'Please tick all three boxes to continue.';
    final needPhoto = _photos.isEmpty;
    setState(() {
      _choiceErrors
        ..clear()
        ..addAll(errors);
      if (needPhoto) _photoNote = 'Add at least one photo of the device.';
    });
    final ok = formOk && errors.isEmpty && !needPhoto;
    if (!ok) {
      final first = _problemSections();
      if (first.isNotEmpty) _scrollTo(first.first);
    }
    return ok;
  }

  // Which section each server field lives in, so an error can take the person to it.
  static const _fieldSection = {
    'photos': 'photos',
    'name': 'basics',
    'category': 'basics',
    'brand': 'basics',
    'model': 'basics',
    'modelYear': 'age',
    'purchaseYear': 'age',
    'condition': 'condition',
    'description': 'condition',
    'conditionDetails': 'condition',
    'preferredService': 'service',
    'expectedPrice': 'price',
    'pickupPreference': 'handover',
    'addressArea': 'where',
    'agentPhone': 'where',
    'city': 'where',
  };

  Future<void> _submit({required bool draft}) async {
    if (!_validateAll()) return;
    setState(() {
      _busy = true;
      _banner = null;
      _serverErrors = const {};
      _progress = null;
    });
    final input = ListingInput(
      name: _name.text,
      category: _category,
      condition: _condition,
      conditionDetails: _answeredDetails(),
      preferredService: _service,
      brand: _brand.text,
      model: _model.text,
      modelYear: _modelYear.text,
      purchaseYear: _year.text,
      expectedPrice: _price.text,
      pickupPreference: _pickup,
      addressArea: _area.text,
      city: _city.text,
      agentPhone: _agentPhone.text,
      lat: _where?.lat,
      lng: _where?.lng,
      draft: draft,
    );
    try {
      final listing = await ref
          .read(deviceRepositoryProvider)
          .create(input, _photos, onProgress: (p) {
        if (mounted) setState(() => _progress = p);
      });
      ref.invalidate(listingProvider(listing.id));
      await ref.read(listingsProvider(true).notifier).load();
      if (draft == false)
        await ref.read(listingsProvider(false).notifier).load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content:
              Text(draft ? 'Saved as a draft.' : 'Your device is listed.')));
      context.pushReplacement(Routes.listing(listing.id));
    } on ApiException catch (e) {
      if (!mounted) return;
      final first = [
        for (final name in _sectionOrder)
          if (e.fieldErrors.keys.any((k) => _fieldSection[k] == name)) name
      ];
      setState(() {
        _busy = false;
        _progress = null;
        _serverErrors = e.fieldErrors;
        _banner = e.fieldErrors.isEmpty
            ? e.message
            : 'Please fix the highlighted fields.';
        if (e.fieldErrors['photos'] != null)
          _photoNote = e.fieldErrors['photos'];
      });
      if (first.isNotEmpty) _scrollTo(first.first);
    }
  }

  // ---- building blocks ----

  Widget _group(String title, String key, List<Widget> chips) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
              header: true,
              child: Text(title,
                  style: Theme.of(context)
                      .textTheme
                      .titleLarge
                      ?.copyWith(fontSize: 16))),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: chips),
          if (_choiceErrors[key] != null || _serverErrors[key] != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                _choiceErrors[key] ?? _serverErrors[key]!,
                style: TextStyle(
                    color: Theme.of(context).colorScheme.error, fontSize: 13),
              ),
            ),
        ],
      );

  /// A card with an icon, a title and a line of help, holding one part of the form.
  Widget _card(
      {required String section,
      required IconData icon,
      required String title,
      String? subtitle,
      required List<Widget> children}) {
    final theme = Theme.of(context);
    return Padding(
      key: _sections[section],
      padding: const EdgeInsets.only(bottom: 16),
      child: GlassContainer(
        radius: 24,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                ExcludeSemantics(
                  child: Container(
                    width: 42,
                    height: 42,
                    decoration: BoxDecoration(
                        color:
                            theme.colorScheme.primary.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(14)),
                    child:
                        Icon(icon, size: 22, color: theme.colorScheme.primary),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Semantics(
                          header: true,
                          child:
                              Text(title, style: theme.textTheme.titleMedium)),
                      if (subtitle != null) ...[
                        const SizedBox(height: 2),
                        Text(subtitle, style: theme.textTheme.bodySmall)
                      ],
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 16),
            ...children,
          ],
        ),
      ),
    );
  }

  Widget _photosStep() {
    final theme = Theme.of(context);
    final full = _photos.length >= maxPhotos;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _card(
          section: 'photos',
          icon: Icons.photo_camera_outlined,
          title: 'Add photos',
          subtitle: 'The first photo is the cover.',
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.06),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                    color: theme.colorScheme.primary.withValues(alpha: 0.35)),
              ),
              child: Column(
                children: [
                  Icon(Icons.add_photo_alternate_outlined,
                      size: 40, color: theme.colorScheme.primary),
                  const SizedBox(height: 8),
                  Text(
                    _photos.isEmpty
                        ? 'No photos yet. At least one photo is needed.'
                        : 'Add more if you like.',
                    style: theme.textTheme.titleSmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Clear photos help a technician or buyer judge the device. Show every side, and any damage.',
                    style: theme.textTheme.bodySmall,
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 14),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: full ? null : _camera,
                          icon: const Icon(Icons.photo_camera_outlined),
                          label: const Text('Take a photo'),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: full ? null : _gallery,
                          icon: const Icon(Icons.photo_library_outlined),
                          label: const Text('Gallery'),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Text('${_photos.length} of $maxPhotos photos',
                    style: theme.textTheme.labelLarge),
                const SizedBox(width: 12),
                Expanded(
                    child: LinearProgressIndicator(
                        value: _photos.length / maxPhotos,
                        minHeight: 6,
                        borderRadius: BorderRadius.circular(3))),
              ],
            ),
            if (_photoNote != null) ...[
              const SizedBox(height: 10),
              MessageBanner(message: _photoNote!, tone: BannerTone.warning)
            ],
            const SizedBox(height: 12),
            // A small button, not a big card: the AI help opens only when asked for.
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                onPressed: () => setState(() => _showAi = !_showAi),
                icon: const Icon(Icons.auto_awesome_outlined, size: 18),
                label: Text(_showAi ? 'Hide AI help' : 'AI help'),
                style: OutlinedButton.styleFrom(
                    minimumSize: const Size(0, 40),
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    visualDensity: VisualDensity.compact),
              ),
            ),
            if (_photos.isNotEmpty) ...[
              const SizedBox(height: 12),
              GridView.count(
                crossAxisCount: 3,
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: [
                  for (var i = 0; i < _photos.length; i++)
                    Stack(
                      fit: StackFit.expand,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(16),
                          child: Image.file(
                            File(_photos[i].path),
                            fit: BoxFit.cover,
                            semanticLabel: 'Photo ${i + 1}',
                            errorBuilder: (_, __, ___) => Container(
                                color: theme.colorScheme.onSurface
                                    .withValues(alpha: 0.08),
                                child: const Icon(Icons.image_outlined)),
                          ),
                        ),
                        if (i == 0)
                          Positioned(
                            left: 6,
                            bottom: 6,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 3),
                              decoration: BoxDecoration(
                                  color: theme.colorScheme.primary,
                                  borderRadius: BorderRadius.circular(10)),
                              child: Text('Cover',
                                  style: theme.textTheme.labelSmall?.copyWith(
                                      color: theme.colorScheme.onPrimary,
                                      fontWeight: FontWeight.w700)),
                            ),
                          ),
                        Positioned(
                          top: 0,
                          right: 0,
                          child: IconButton(
                            tooltip: 'Remove photo ${i + 1}',
                            style: IconButton.styleFrom(
                                backgroundColor:
                                    Colors.black.withValues(alpha: 0.6),
                                foregroundColor: Colors.white,
                                minimumSize: const Size(44, 44)),
                            icon: const Icon(Icons.close, size: 18),
                            onPressed: () => setState(() {
                              _photos.removeAt(i);
                              _photoNote = null;
                            }),
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            ],
          ],
        ),
        if (_showAi)
          Padding(
              padding: const EdgeInsets.only(bottom: 16),
              child: AiAssistCard(
                  photos: _photos, words: _wordsSoFar, onApply: _applyAi)),
      ],
    );
  }

  /// A spot was chosen (the phone's position or a map pin). The area and city are filled in from it, but only the ones that are
  /// still empty: nothing the person typed is replaced, and if the address service is out of reach they simply type them.
  /// "Detect my current location" found the spot and its address: the area and city are filled in (replacing what was there).
  void _onDetected(GeoPoint point, GeoPlace? place) {
    setState(() {
      _where = point;
      if (place != null) {
        if (place.area.isNotEmpty) _area.text = place.area;
        if (place.city.isNotEmpty) _city.text = place.city;
      }
    });
  }

  Future<void> _onWhere(GeoPoint? point) async {
    setState(() => _where = point);
    if (point == null) return;
    try {
      final place =
          await ref.read(geoRepositoryProvider).reverse(point.lat, point.lng);
      if (!mounted || place == null || !identical(_where, point)) return;
      setState(() {
        if (place.area.isNotEmpty) _area.text = place.area;
        if (place.city.isNotEmpty) _city.text = place.city;
      });
    } on ApiException {
      // Optional help: nothing to say.
    }
  }

  Widget _deviceStep() {
    final categories = ref.watch(categoriesProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _card(
          section: 'basics',
          icon: Icons.devices_other_outlined,
          title: 'The basics',
          subtitle: 'What it is, and who made it.',
          children: [
            AppTextField(
                controller: _name,
                label: 'Device name',
                icon: Icons.devices_other_outlined,
                validator: validateDeviceName,
                serverError: _serverErrors['name'],
                textInputAction: TextInputAction.next),
            const SizedBox(height: 16),
            categories.when(
              data: (list) => _group('Category', 'category', [
                for (final c in list)
                  AppChip(
                      label: c.name,
                      selected: _category == c.slug,
                      onTap: () => setState(() => _category = c.slug)),
              ]),
              loading: () => const LinearProgressIndicator(),
              error: (e, _) => MessageBanner(
                tone: BannerTone.error,
                message:
                    'Could not load categories. ${e is ApiException ? e.message : ''}',
                action: TextButton(
                    onPressed: () => ref.invalidate(categoriesProvider),
                    child: const Text('Retry')),
              ),
            ),
            const SizedBox(height: 16),
            AppTextField(
                controller: _brand,
                label: 'Brand',
                validator: validateBrand,
                serverError: _serverErrors['brand'],
                textInputAction: TextInputAction.next),
            const SizedBox(height: 12),
            AppTextField(
                controller: _model,
                label: 'Model',
                validator: validateModel,
                serverError: _serverErrors['model'],
                textInputAction: TextInputAction.next),
          ],
        ),
        _card(
          section: 'age',
          icon: Icons.event_outlined,
          title: 'Age',
          subtitle: 'Helps work out what it is worth.',
          children: [
            AppTextField(
              controller: _modelYear,
              label: 'Model year (when this model came out)',
              icon: Icons.event_outlined,
              keyboardType: TextInputType.number,
              validator: validateModelYear,
              serverError: _serverErrors['modelYear'],
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 12),
            AppTextField(
              controller: _year,
              label: 'Year bought (same as or after the model year)',
              icon: Icons.event_outlined,
              keyboardType: TextInputType.number,
              validator: (v) =>
                  validatePurchaseYear(v, modelYear: _modelYear.text),
              serverError: _serverErrors['purchaseYear'],
              textInputAction: TextInputAction.next,
            ),
          ],
        ),
        _card(
          section: 'condition',
          icon: Icons.fact_check_outlined,
          title: 'Condition',
          subtitle: 'Be honest: it saves everyone a wasted trip.',
          children: [
            _group('Condition', 'condition', [
              for (final (value, label) in conditions)
                AppChip(
                    label: label,
                    selected: _condition == value,
                    onTap: () => setState(() => _condition = value)),
            ]),
            ..._partsSection(),
          ],
        ),
      ],
    );
  }

  /// "Condition of each part (optional)": a short list of answers for each part that fits the category, and a suggestion for the
  /// overall condition that follows from them.
  List<Widget> _partsSection() {
    final theme = Theme.of(context);
    final slug = _category.isEmpty ? null : _category;
    final required = requiredPartsFor(slug);
    final optional = optionalPartsFor(slug);
    final suggested = suggestCondition(_answeredDetails());
    return [
      const SizedBox(height: 20),
      Semantics(
          header: true,
          child: Text('Condition of each part',
              style: theme.textTheme.titleLarge?.copyWith(fontSize: 16))),
      const SizedBox(height: 4),
      Text(
          'Battery, screen, ports and buttons, and water damage are needed. Press "Show more" for the other parts, which are optional.',
          style: theme.textTheme.bodyMedium),
      if (suggested.isNotEmpty && suggested != _condition) ...[
        const SizedBox(height: 10),
        MessageBanner(
          tone: BannerTone.info,
          message:
              'Based on your answers we suggest: ${labelOf(conditions, suggested)}',
          action: TextButton(
              onPressed: () => setState(() => _condition = suggested),
              child: const Text('Use this')),
        ),
      ],
      for (final part in required) _partGroup(part, required: true),
      if (_showMoreParts)
        for (final part in optional) _partGroup(part),
      if (optional.isNotEmpty) ...[
        const SizedBox(height: 10),
        OutlinedButton.icon(
          onPressed: () => setState(() => _showMoreParts = !_showMoreParts),
          icon: Icon(_showMoreParts ? Icons.expand_less : Icons.expand_more),
          label: Text(_showMoreParts
              ? 'Show fewer details'
              : 'Show more (${optional.length})'),
        ),
      ],
      if (_serverErrors['conditionDetails'] != null)
        Padding(
            padding: const EdgeInsets.only(top: 6),
            child: Text(_serverErrors['conditionDetails']!,
                style:
                    TextStyle(color: theme.colorScheme.error, fontSize: 13))),
    ];
  }

  Widget _offerStep() {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _card(
          section: 'service',
          icon: Icons.swap_horiz_rounded,
          title: 'What do you want to do with it?',
          children: [
            _group('What do you want to do with it?', 'service', [
              for (final (value, label) in services)
                if (listableServices.contains(value) || value == _service)
                  AppChip(
                      label: label,
                      selected: _service == value,
                      onTap: () => setState(() => _service = value)),
            ]),
          ],
        ),
        _card(
          section: 'price',
          icon: Icons.currency_rupee,
          title: 'Price',
          subtitle: 'Optional.',
          children: [
            AppTextField(
              controller: _price,
              label: 'Asking price in ₹ (optional, 0 for free)',
              icon: Icons.currency_rupee,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              validator: validateExpectedPrice,
              serverError: _serverErrors['expectedPrice'],
              textInputAction: TextInputAction.next,
            ),
            const SizedBox(height: 6),
            _priceHint(),
          ],
        ),
        _card(
          section: 'handover',
          icon: Icons.local_shipping_outlined,
          title: 'Handover',
          subtitle: 'How the device changes hands.',
          children: [
            _group('Handover', 'pickupPreference', [
              for (final (value, label) in pickups)
                AppChip(
                    label: label,
                    selected: _pickup == value,
                    onTap: () => setState(() => _pickup = value)),
            ]),
          ],
        ),
        _card(
          section: 'where',
          icon: Icons.place_outlined,
          title: 'Where is it?',
          subtitle:
              'Only the area is shown to others. Your street address is never listed.',
          children: [
            AppTextField(
                controller: _city,
                label: 'City',
                icon: Icons.location_city_outlined,
                validator: validateCity,
                serverError: _serverErrors['city'],
                textInputAction: TextInputAction.next),
            const SizedBox(height: 12),
            AppTextField(
                controller: _area,
                label: 'Area or neighbourhood',
                icon: Icons.place_outlined,
                validator: validateArea,
                serverError: _serverErrors['addressArea'],
                textInputAction: TextInputAction.done),
            const SizedBox(height: 12),
            AppTextField(
                controller: _agentPhone,
                label: 'Your phone number',
                icon: Icons.phone_outlined,
                keyboardType: TextInputType.phone,
                validator: validateAgentPhone,
                serverError: _serverErrors['agentPhone'],
                textInputAction: TextInputAction.done),
            const SizedBox(height: 16),
            LocationField(
                value: _where, onChanged: _onWhere, onDetected: _onDetected),
          ],
        ),
        _card(
          section: 'protect',
          icon: Icons.shield_outlined,
          title: 'Protect your data',
          subtitle:
              'Please confirm every point. You cannot continue until all three boxes are ticked.',
          children: [
            for (var i = 0; i < dataProtectionChecklist.length; i++)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: _checks[i],
                title: Text(dataProtectionChecklist[i]),
                onChanged: (v) => setState(() {
                  _checks[i] = v ?? false;
                  _choiceErrors.remove('checklist');
                }),
              ),
            if (_choiceErrors['checklist'] != null)
              Padding(
                padding: const EdgeInsets.only(top: 6),
                child: Text(_choiceErrors['checklist']!,
                    style: TextStyle(
                        color: theme.colorScheme.error, fontSize: 13)),
              ),
          ],
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'List a device'),
        body: AppBackground(
          child: SafeArea(
            child: Column(
              children: [
                Expanded(
                  child: Form(
                    key: _formKey,
                    // Not a lazy list: every field is built, so the whole form is checked and any section can be scrolled to.
                    child: SingleChildScrollView(
                      controller: _scroll,
                      padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Text('List your device',
                              style: theme.textTheme.headlineSmall),
                          const SizedBox(height: 2),
                          Text(
                              'Add photos, tell us about the device, and choose what happens next. It is all on this page: just scroll.',
                              style: theme.textTheme.bodyMedium),
                          const SizedBox(height: 16),
                          if (_banner != null) ...[
                            MessageBanner(
                                message: _banner!, tone: BannerTone.error),
                            const SizedBox(height: 12)
                          ],
                          _photosStep(),
                          _deviceStep(),
                          _offerStep(),
                        ],
                      ),
                    ),
                  ),
                ),
                // The buttons sit on their own bar, so they never cover the form.
                DecoratedBox(
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surface.withValues(alpha: 0.92),
                    border: Border(
                        top: BorderSide(
                            color: theme.colorScheme.outlineVariant)),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        if (_busy && _photos.isNotEmpty) ...[
                          Semantics(
                            liveRegion: true,
                            label: _progress == null
                                ? 'Uploading'
                                : 'Uploading ${(_progress! * 100).round()} percent',
                            child: LinearProgressIndicator(
                                value: _progress,
                                minHeight: 6,
                                borderRadius: BorderRadius.circular(3)),
                          ),
                          const SizedBox(height: 8),
                        ],
                        LoadingButton(
                            label: 'Publish listing',
                            loading: _busy,
                            onPressed: () => _submit(draft: false)),
                        TextButton(
                            onPressed:
                                _busy ? null : () => _submit(draft: true),
                            child: const Text('Save as draft')),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
