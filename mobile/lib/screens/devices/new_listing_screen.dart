import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/listing_validation.dart';
import '../../core/network/api_exception.dart';
import '../../models/listing_input.dart';
import '../../providers/listings_controller.dart';
import '../../providers/photo_providers.dart';
import '../../routes/route_paths.dart';
import '../../services/location_service.dart';
import '../../services/photo_picker.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/app_text_field.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/loading_button.dart';
import '../../widgets/location_field.dart';
import '../../widgets/message_banner.dart';

/// List a device in three short steps: photos, the device, and what you want done with it.
class NewListingScreen extends ConsumerStatefulWidget {
  const NewListingScreen({super.key});

  @override
  ConsumerState<NewListingScreen> createState() => _NewListingScreenState();
}

class _NewListingScreenState extends ConsumerState<NewListingScreen> {
  static const _stepTitles = ['Photos', 'The device', 'What you want'];

  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _brand = TextEditingController();
  final _model = TextEditingController();
  final _year = TextEditingController();
  final _description = TextEditingController();
  final _price = TextEditingController();
  final _city = TextEditingController();
  final _area = TextEditingController();

  final List<PickedPhoto> _photos = [];
  GeoPoint? _where;
  int _step = 0;
  String _category = '';
  String _condition = '';
  String _service = '';
  String _pickup = 'either';

  // Messages for the choice groups (chips), which are not form fields.
  final Map<String, String> _choiceErrors = {};
  Map<String, String> _serverErrors = const {};
  String? _banner;
  String? _photoNote;
  bool _busy = false;
  double? _progress;

  @override
  void dispose() {
    for (final c in [_name, _brand, _model, _year, _description, _price, _city, _area]) {
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
      if (mounted) setState(() => _photoNote = 'Could not open that. Check that the app is allowed to use the camera and photos, or try the other option.');
    }
  }

  Future<void> _camera() => _pick(() async {
        final photo = await ref.read(photoPickerProvider).takePhoto();
        return photo == null ? const <PickedPhoto>[] : [photo];
      });

  Future<void> _gallery() => _pick(() => ref.read(photoPickerProvider).choosePhotos(limit: maxPhotos - _photos.length));

  // ---- steps ----

  bool _validateStep() {
    final formOk = _formKey.currentState?.validate() ?? true;
    final errors = <String, String>{};
    if (_step == 1) {
      if (_category.isEmpty) errors['category'] = 'Choose a category';
      if (_condition.isEmpty) errors['condition'] = 'Choose the condition';
    }
    if (_step == 2 && _service.isEmpty) errors['service'] = 'Choose what you want to do with it';
    setState(() {
      _choiceErrors
        ..clear()
        ..addAll(errors);
    });
    return formOk && errors.isEmpty;
  }

  void _next() {
    if (!_validateStep()) return;
    setState(() {
      _step++;
      _banner = null;
    });
  }

  void _back() => setState(() {
        _step--;
        _banner = null;
      });

  // Where each server field lives, so an error can take the person to the right step.
  static const _fieldStep = {
    'name': 1, 'category': 1, 'brand': 1, 'model': 1, 'purchaseYear': 1, 'condition': 1, 'description': 1,
    'preferredService': 2, 'expectedPrice': 2, 'pickupPreference': 2, 'addressArea': 2, 'city': 2,
  };

  Future<void> _submit({required bool draft}) async {
    if (!_validateStep()) return;
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
      preferredService: _service,
      brand: _brand.text,
      model: _model.text,
      purchaseYear: _year.text,
      description: _description.text,
      expectedPrice: _price.text,
      pickupPreference: _pickup,
      addressArea: _area.text,
      city: _city.text,
      lat: _where?.lat,
      lng: _where?.lng,
      draft: draft,
    );
    try {
      final listing = await ref.read(deviceRepositoryProvider).create(input, _photos, onProgress: (p) {
        if (mounted) setState(() => _progress = p);
      });
      ref.invalidate(listingProvider(listing.id));
      await ref.read(listingsProvider(true).notifier).load();
      if (draft == false) await ref.read(listingsProvider(false).notifier).load();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(draft ? 'Saved as a draft.' : 'Your device is listed.')));
      context.pushReplacement(Routes.listing(listing.id));
    } on ApiException catch (e) {
      if (!mounted) return;
      final firstBad = e.fieldErrors.keys.map((k) => _fieldStep[k]).whereType<int>().fold<int?>(null, (a, b) => a == null || b < a ? b : a);
      setState(() {
        _busy = false;
        _progress = null;
        _serverErrors = e.fieldErrors;
        _banner = e.fieldErrors.isEmpty ? e.message : 'Please fix the highlighted fields.';
        if (e.fieldErrors['photos'] != null) {
          _step = 0;
          _photoNote = e.fieldErrors['photos'];
        } else if (firstBad != null) {
          _step = firstBad;
        }
      });
    }
  }

  // ---- building blocks ----

  Widget _group(String title, String key, List<Widget> chips) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(header: true, child: Text(title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: 16))),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: chips),
          if (_choiceErrors[key] != null || _serverErrors[key] != null)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Text(
                _choiceErrors[key] ?? _serverErrors[key]!,
                style: TextStyle(color: Theme.of(context).colorScheme.error, fontSize: 13),
              ),
            ),
        ],
      );

  Widget _photosStep() {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Clear photos help a technician or buyer judge the device. Show every side, and any damage.', style: theme.textTheme.bodyMedium),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _photos.length >= maxPhotos ? null : _camera,
                icon: const Icon(Icons.photo_camera_outlined),
                label: const Text('Take a photo'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _photos.length >= maxPhotos ? null : _gallery,
                icon: const Icon(Icons.photo_library_outlined),
                label: const Text('Gallery'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text('${_photos.length} of $maxPhotos photos', style: theme.textTheme.bodyMedium),
        if (_photoNote != null) ...[const SizedBox(height: 8), MessageBanner(message: _photoNote!, tone: BannerTone.warning)],
        const SizedBox(height: 12),
        if (_photos.isEmpty)
          GlassContainer(
            child: Row(
              children: [
                Icon(Icons.add_photo_alternate_outlined, color: theme.colorScheme.primary),
                const SizedBox(width: 12),
                Expanded(child: Text('No photos yet. You can also add them later, but listings with photos get more replies.', style: theme.textTheme.bodyMedium)),
              ],
            ),
          )
        else
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
                        errorBuilder: (_, __, ___) => Container(color: theme.colorScheme.onSurface.withValues(alpha: 0.08), child: const Icon(Icons.image_outlined)),
                      ),
                    ),
                    Positioned(
                      top: 0,
                      right: 0,
                      child: IconButton(
                        tooltip: 'Remove photo ${i + 1}',
                        style: IconButton.styleFrom(backgroundColor: Colors.black.withValues(alpha: 0.6), foregroundColor: Colors.white, minimumSize: const Size(44, 44)),
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
    );
  }

  Widget _deviceStep() {
    final categories = ref.watch(categoriesProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AppTextField(controller: _name, label: 'Device name', icon: Icons.devices_other_outlined, validator: validateDeviceName, serverError: _serverErrors['name'], textInputAction: TextInputAction.next),
        const SizedBox(height: 16),
        categories.when(
          data: (list) => _group('Category', 'category', [
            for (final c in list) AppChip(label: c.name, selected: _category == c.slug, onTap: () => setState(() => _category = c.slug)),
          ]),
          loading: () => const LinearProgressIndicator(),
          error: (e, _) => MessageBanner(
            tone: BannerTone.error,
            message: 'Could not load categories. ${e is ApiException ? e.message : ''}',
            action: TextButton(onPressed: () => ref.invalidate(categoriesProvider), child: const Text('Retry')),
          ),
        ),
        const SizedBox(height: 16),
        AppTextField(controller: _brand, label: 'Brand (optional)', validator: validateBrandOrModel, serverError: _serverErrors['brand'], textInputAction: TextInputAction.next),
        const SizedBox(height: 12),
        AppTextField(controller: _model, label: 'Model (optional)', validator: validateBrandOrModel, serverError: _serverErrors['model'], textInputAction: TextInputAction.next),
        const SizedBox(height: 12),
        AppTextField(
          controller: _year,
          label: 'Year bought (optional)',
          icon: Icons.event_outlined,
          keyboardType: TextInputType.number,
          validator: validatePurchaseYear,
          serverError: _serverErrors['purchaseYear'],
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: 16),
        _group('Condition', 'condition', [
          for (final (value, label) in conditions) AppChip(label: label, selected: _condition == value, onTap: () => setState(() => _condition = value)),
        ]),
        const SizedBox(height: 16),
        AppTextField(controller: _description, label: 'What is wrong, or anything to know (optional)', maxLines: 4, validator: validateDescription, serverError: _serverErrors['description']),
      ],
    );
  }

  Widget _offerStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _group('What do you want to do with it?', 'service', [
          for (final (value, label) in services) AppChip(label: label, selected: _service == value, onTap: () => setState(() => _service = value)),
        ]),
        const SizedBox(height: 16),
        AppTextField(
          controller: _price,
          label: 'Asking price in ₹ (optional, 0 for free)',
          icon: Icons.currency_rupee,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          validator: validateExpectedPrice,
          serverError: _serverErrors['expectedPrice'],
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: 16),
        _group('Handover', 'pickupPreference', [
          for (final (value, label) in pickups) AppChip(label: label, selected: _pickup == value, onTap: () => setState(() => _pickup = value)),
        ]),
        const SizedBox(height: 16),
        AppTextField(controller: _city, label: 'City (optional)', icon: Icons.location_city_outlined, validator: validateAreaOrCity, serverError: _serverErrors['city'], textInputAction: TextInputAction.next),
        const SizedBox(height: 12),
        AppTextField(controller: _area, label: 'Area or neighbourhood (optional)', icon: Icons.place_outlined, validator: validateAreaOrCity, serverError: _serverErrors['addressArea'], textInputAction: TextInputAction.done),
        const SizedBox(height: 12),
        const MessageBanner(tone: BannerTone.info, message: 'Only the area is shown to others. Your street address is never listed.'),
        const SizedBox(height: 16),
        LocationField(value: _where, onChanged: (p) => setState(() => _where = p)),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final last = _step == _stepTitles.length - 1;
    final body = switch (_step) { 0 => _photosStep(), 1 => _deviceStep(), _ => _offerStep() };

    return PopScope(
      canPop: !_busy,
      child: Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'List a device'),
        body: AppBackground(
          child: SafeArea(
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                  child: Semantics(
                    header: true,
                    label: 'Step ${_step + 1} of ${_stepTitles.length}: ${_stepTitles[_step]}',
                    excludeSemantics: true,
                    child: Row(
                      children: [
                        Expanded(child: Text(_stepTitles[_step], style: theme.textTheme.headlineMedium)),
                        Text('${_step + 1} / ${_stepTitles.length}', style: theme.textTheme.labelSmall),
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 0),
                  child: LinearProgressIndicator(value: (_step + 1) / _stepTitles.length, minHeight: 6, borderRadius: BorderRadius.circular(3)),
                ),
                Expanded(
                  child: Form(
                    key: _formKey,
                    child: ListView(
                      padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
                      children: [
                        if (_banner != null) ...[MessageBanner(message: _banner!, tone: BannerTone.error), const SizedBox(height: 12)],
                        body,
                      ],
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (_busy && _photos.isNotEmpty) ...[
                        Semantics(
                          liveRegion: true,
                          label: _progress == null ? 'Uploading' : 'Uploading ${(_progress! * 100).round()} percent',
                          child: LinearProgressIndicator(value: _progress, minHeight: 6, borderRadius: BorderRadius.circular(3)),
                        ),
                        const SizedBox(height: 8),
                      ],
                      Row(
                        children: [
                          if (_step > 0) ...[
                            OutlinedButton(onPressed: _busy ? null : _back, child: const Text('Back')),
                            const SizedBox(width: 12),
                          ],
                          Expanded(
                            child: LoadingButton(
                              label: last ? 'Publish listing' : 'Next',
                              loading: _busy,
                              onPressed: last ? () => _submit(draft: false) : _next,
                            ),
                          ),
                        ],
                      ),
                      if (last) TextButton(onPressed: _busy ? null : () => _submit(draft: true), child: const Text('Save as draft')),
                    ],
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
