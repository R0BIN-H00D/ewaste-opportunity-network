import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/condition_parts.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/refurbishment_validation.dart';
import '../../models/listing.dart' show Category, ListingPhoto;
import '../../models/marketplace.dart';
import '../../models/refurbishment.dart';
import '../../providers/listings_controller.dart';
import '../../providers/marketplace_providers.dart';
import '../../providers/refurbishment_providers.dart';
import '../../routes/route_paths.dart';
import '../../services/marketplace_repository.dart';
import '../../services/photo_picker.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/app_text_field.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/listing_photo.dart';
import '../../widgets/loading_button.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/photo_attachments.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import '../requests/request_dialogs.dart';

/// List a refurbished product, or change one. Give [productId] to edit, or [jobId] to list the product made from a finished job.
class ProductFormScreen extends ConsumerWidget {
  const ProductFormScreen({super.key, this.productId, this.jobId});

  final String? productId;
  final String? jobId;

  bool get editing => productId != null;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final AsyncValue<List<Category>> categories = ref.watch(categoriesProvider);
    final AsyncValue<Product?> product = editing ? ref.watch(productProvider(productId!)) : const AsyncData<Product?>(null);
    final AsyncValue<RefurbJob?> job = jobId != null ? ref.watch(refurbJobProvider(jobId!)) : const AsyncData<RefurbJob?>(null);
    final error = categories.error ?? product.error ?? job.error;
    final ready = categories.hasValue && product.hasValue && job.hasValue;
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, editing ? 'Edit product' : 'List a product'),
      body: AppBackground(
        child: SafeArea(
          child: error != null
              ? ListView(padding: const EdgeInsets.all(20), children: [
                  ErrorState(
                    error: ApiException.from(error),
                    onRetry: () {
                      ref.invalidate(categoriesProvider);
                      if (editing) ref.invalidate(productProvider(productId!));
                      if (jobId != null) ref.invalidate(refurbJobProvider(jobId!));
                    },
                  ),
                ])
              : !ready
                  ? ListView(padding: const EdgeInsets.all(20), children: const [Skeleton(height: 56, radius: 16), SizedBox(height: 12), Skeleton(height: 56, radius: 16), SizedBox(height: 12), Skeleton(height: 120, radius: 16)])
                  : _Form(categories: categories.requireValue, product: product.valueOrNull is Product ? product.value as Product : null, job: job.valueOrNull is RefurbJob ? job.value as RefurbJob : null, jobId: jobId),
        ),
      ),
    );
  }
}

class _Form extends ConsumerStatefulWidget {
  const _Form({required this.categories, this.product, this.job, this.jobId});

  final List<Category> categories;
  final Product? product;
  final RefurbJob? job;
  final String? jobId;

  @override
  ConsumerState<_Form> createState() => _FormState();
}

class _FormState extends ConsumerState<_Form> {
  final _formKey = GlobalKey<FormState>();
  late final _title = TextEditingController(text: widget.product?.title ?? widget.job?.device.title ?? '');
  late final _brand = TextEditingController(text: widget.product?.brand ?? widget.job?.device.brand ?? '');
  late final _model = TextEditingController(text: widget.product?.model ?? widget.job?.device.model ?? '');
  late final _info = TextEditingController(text: widget.product?.refurbishmentInfo ?? '');
  late final _price = TextEditingController(text: widget.product == null ? '' : _plain(widget.product!.price));
  late final _stock = TextEditingController(text: '${widget.product?.stock ?? 1}');
  late final _specs = TextEditingController(text: widget.product == null ? '' : specsToText(widget.product!.specs));
  late final _conditionNote = TextEditingController(text: widget.product?.conditionNote ?? '');
  // How each part is doing (optional): part key -> chosen value. The other parts stay folded away unless one already has an answer.
  late final Map<String, String> _details = {...?widget.product?.conditionDetails};
  late bool _showMoreParts = _details.keys.any((k) => !_mainParts.contains(k));
  static const _mainParts = ['power', 'battery', 'screen', 'body'];
  late String? _category = widget.product?.categorySlug ?? _slugOfJob();
  late String? _condition = widget.product?.condition;
  late String _status = widget.product?.status == 'hidden' ? 'hidden' : 'active';
  final _removed = <String>{};
  List<PickedPhoto> _photos = const [];
  bool _busy = false;
  String? _error;

  bool get _editing => widget.product != null;
  bool get _fromJob => widget.jobId != null && !_editing;

  static String _plain(double v) => v == v.roundToDouble() ? v.round().toString() : v.toString();

  String? _slugOfJob() {
    final name = widget.job?.device.categoryName;
    if (name == null) return null;
    for (final c in widget.categories) {
      if (c.name == name) return c.slug;
    }
    return null;
  }

  @override
  void dispose() {
    for (final c in [_title, _brand, _model, _info, _price, _stock, _specs, _conditionNote]) {
      c.dispose();
    }
    super.dispose();
  }

  Map<String, String> _answeredDetails() {
    final asked = conditionPartsFor(_category).map((p) => p.key);
    return {for (final e in _details.entries) if (asked.contains(e.key) && e.value.isNotEmpty) e.key: e.value};
  }

  /// Chips for one part. Tapping the chosen answer again takes it back.
  Widget _partGroup(ThemeData theme, ConditionPart part) => Padding(
        padding: const EdgeInsets.only(top: 14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(header: true, child: Text(part.label, style: theme.textTheme.titleSmall)),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: [
              for (final (value, label) in part.options)
                AppChip(
                  label: label,
                  selected: _details[part.key] == value,
                  onTap: () => setState(() => _details[part.key] == value ? _details.remove(part.key) : _details[part.key] = value),
                ),
            ]),
          ],
        ),
      );

  List<ListingPhoto> get _kept => [for (final p in widget.product?.photos ?? const <ListingPhoto>[]) if (!_removed.contains(p.publicId)) p];

  Future<void> _save() async {
    setState(() => _error = null);
    if (!_formKey.currentState!.validate()) return;
    final sharedPhotos = widget.job?.afterPhotos.length ?? 0;
    final total = _kept.length + _photos.length + (_fromJob && _photos.isEmpty ? sharedPhotos : 0);
    if (total == 0) {
      setState(() => _error = _fromJob ? 'Add at least one photo. The "after" photos of the job are used if you add none.' : 'Add at least one photo of the product');
      return;
    }
    final specs = parseSpecs(_specs.text);
    setState(() => _busy = true);
    try {
      final repo = ref.read(marketplaceRepositoryProvider);
      final input = ProductInput(
        title: _title.text.trim(),
        category: _category,
        brand: _brand.text.trim(),
        model: _model.text.trim(),
        specs: specs.specs,
        condition: _condition,
        refurbishmentInfo: _info.text.trim(),
        // Only the parts asked about for this category that were answered; on an update an empty set clears the old answers.
        conditionDetails: _answeredDetails().isNotEmpty || _editing ? _answeredDetails() : null,
        conditionNote: _conditionNote.text.trim().isNotEmpty || _editing ? _conditionNote.text.trim() : null,
        price: parseMoney(_price.text),
        stock: _fromJob ? null : int.tryParse(_stock.text.trim()),
        jobId: _fromJob ? widget.jobId : null,
        status: _editing && widget.product!.status != 'sold' ? _status : null,
        removePhotoIds: _removed.toList(),
        photos: _photos,
      );
      final saved = _editing ? await repo.updateProduct(widget.product!.id, input) : await repo.createProduct(input);
      ref.invalidate(myProductsProvider);
      ref.invalidate(productsProvider);
      ref.invalidate(productProvider(saved.id));
      if (widget.jobId != null) {
        ref.invalidate(refurbJobProvider(widget.jobId!));
        ref.invalidate(refurbJobsProvider);
        ref.invalidate(listingsProvider(true));
        ref.invalidate(listingsProvider(false));
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(_editing ? 'Product saved' : 'Your product is on sale')));
      if (_editing) {
        context.canPop() ? context.pop() : context.go(Routes.myProducts);
      } else {
        context.pushReplacement(Routes.product(saved.id));
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete() async {
    final ok = await askConfirm(context, title: 'Remove this product?', message: 'It is taken off the shop. This cannot be undone. A product with open orders cannot be removed.', confirmLabel: 'Remove');
    if (!ok) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(marketplaceRepositoryProvider).removeProduct(widget.product!.id);
      ref.invalidate(myProductsProvider);
      ref.invalidate(productsProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Product removed')));
      context.canPop() ? context.pop() : context.go(Routes.myProducts);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// A heading with an icon at the top of each group of fields.
  Widget _sectionTitle(ThemeData theme, IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 14),
        child: Row(
          children: [
            Icon(icon, size: 20, color: theme.colorScheme.primary),
            const SizedBox(width: 8),
            Expanded(child: Semantics(header: true, child: Text(text, style: theme.textTheme.titleMedium))),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final kept = _kept;
    return Form(
      key: _formKey,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
        children: [
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _sectionTitle(theme, Icons.devices_other_outlined, 'About the device'),
                if (_fromJob) ...[
                  const MessageBanner(message: 'Made from your finished job. The device is sold as one item and the owner is told it is on sale.', tone: BannerTone.info),
                  const SizedBox(height: 12),
                ],
                AppTextField(controller: _title, label: 'Title', icon: Icons.sell_outlined, validator: validateProductTitle),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: widget.categories.any((c) => c.slug == _category) ? _category : null,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Type of device'),
                  items: [for (final c in widget.categories) DropdownMenuItem(value: c.slug, child: Text(c.name))],
                  validator: (v) => v == null ? 'Choose the type of device' : null,
                  onChanged: (v) => setState(() => _category = v),
                ),
                const SizedBox(height: 12),
                AppTextField(controller: _brand, label: 'Brand (optional)', validator: validateBrandOrModel),
                const SizedBox(height: 12),
                AppTextField(controller: _model, label: 'Model (optional)', validator: validateBrandOrModel),
              ],
            ),
          ),
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _sectionTitle(theme, Icons.fact_check_outlined, 'Condition and price'),
                DropdownButtonFormField<String>(
                  initialValue: _condition,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Condition (shown to buyers)'),
                  items: [for (final (value, label) in productConditions) DropdownMenuItem(value: value, child: Text(label))],
                  validator: (v) => v == null ? 'Choose the condition you are selling it in' : null,
                  onChanged: (v) => setState(() => _condition = v),
                ),
                const SizedBox(height: 12),
                AppTextField(controller: _info, label: 'What was repaired, replaced or tested?', maxLines: 4, validator: validateRefurbishmentInfo),
                const SizedBox(height: 12),
                AppTextField(controller: _price, label: 'Price in rupees', icon: Icons.currency_rupee, keyboardType: const TextInputType.numberWithOptions(decimal: true), validator: validateProductPrice),
                if (!_fromJob) ...[
                  const SizedBox(height: 12),
                  AppTextField(controller: _stock, label: 'How many in stock', keyboardType: TextInputType.number, validator: stockValidator(allowZero: _editing)),
                ],
                const SizedBox(height: 12),
                AppTextField(controller: _specs, label: 'Specifications (optional, one per line, "RAM: 8 GB")', maxLines: 4, validator: validateSpecs),
              ],
            ),
          ),
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _sectionTitle(theme, Icons.fact_check_outlined, 'Condition of each part (optional)'),
                Text('Buyers see these in "About this device" on the product page: the working condition, battery, screen, scratches and more.', style: theme.textTheme.bodyMedium),
                for (final part in conditionPartsFor(_category))
                  if (_mainParts.contains(part.key) || _showMoreParts) _partGroup(theme, part),
                if (conditionPartsFor(_category).any((p) => !_mainParts.contains(p.key))) ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () => setState(() => _showMoreParts = !_showMoreParts),
                    icon: Icon(_showMoreParts ? Icons.expand_less : Icons.expand_more),
                    label: Text(_showMoreParts ? 'Show fewer details' : 'Show more (${conditionPartsFor(_category).where((p) => !_mainParts.contains(p.key)).length})'),
                  ),
                ],
                const SizedBox(height: 14),
                AppTextField(controller: _conditionNote, label: 'Other notes (optional)', maxLines: 3, validator: (v) => (v ?? '').trim().length > 1000 ? 'Use at most 1000 characters' : null),
              ],
            ),
          ),
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _sectionTitle(theme, Icons.photo_camera_outlined, 'Photos'),
                if (kept.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  SizedBox(
                    height: 90,
                    child: ListView.separated(
                      scrollDirection: Axis.horizontal,
                      itemCount: kept.length,
                      separatorBuilder: (_, __) => const SizedBox(width: 8),
                      itemBuilder: (_, i) => Stack(
                        children: [
                          ClipRRect(borderRadius: BorderRadius.circular(12), child: SizedBox(width: 90, height: 90, child: ListingPhotoView(photo: kept[i], semanticLabel: 'Current photo ${i + 1}'))),
                          Positioned(
                            top: 0,
                            right: 0,
                            child: IconButton.filledTonal(
                              tooltip: 'Remove photo ${i + 1}',
                              visualDensity: VisualDensity.compact,
                              icon: const Icon(Icons.close, size: 16),
                              onPressed: () => setState(() => _removed.add(kept[i].publicId)),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                ],
                const SizedBox(height: 8),
                PhotoAttachments(photos: _photos, onChanged: (p) => setState(() => _photos = p), max: 8 - kept.length, label: _editing ? 'Add photos' : 'Photos'),
              ],
            ),
          ),
          if (_editing && widget.product!.status != 'sold') ...[
            const SizedBox(height: 16),
            GlassContainer(
              child: Material(
                type: MaterialType.transparency,
                child: SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Show in the shop'),
                  subtitle: Text(_status == 'active' ? 'Buyers can see and order it.' : 'Hidden. Only you can see it.'),
                  value: _status == 'active',
                  onChanged: (v) => setState(() => _status = v ? 'active' : 'hidden'),
                ),
              ),
            ),
          ],
          if (_error != null) ...[const SizedBox(height: 16), MessageBanner(message: _error!, tone: BannerTone.error)],
          const SizedBox(height: 16),
          LoadingButton(label: _editing ? 'Save changes' : 'Put it on sale', icon: Icons.check, loading: _busy, onPressed: _save),
          if (_editing) ...[
            const SizedBox(height: 8),
            OutlinedButton.icon(onPressed: _busy ? null : _delete, icon: const Icon(Icons.delete_outline), label: const Text('Remove product'), style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48))),
          ],
        ],
      ),
    );
  }
}
