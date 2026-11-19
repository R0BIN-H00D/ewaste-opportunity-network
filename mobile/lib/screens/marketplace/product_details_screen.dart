import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/theme/app_colors.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/listing.dart';
import '../../models/marketplace.dart';
import '../../providers/marketplace_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/listing_photo.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import 'order_dialogs.dart';
import 'product_card.dart';

/// One refurbished product: photos, the "Refurbished" label with its grade, what was done to it, specifications, the seller,
/// and the buttons to order it or ask a question.
class ProductDetailsScreen extends ConsumerWidget {
  const ProductDetailsScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final product = ref.watch(productProvider(id));
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Refurbished device'),
      body: AppBackground(
        child: SafeArea(
          child: product.when(
            loading: () =>
                ListView(padding: const EdgeInsets.all(20), children: const [
              Skeleton(height: 220, radius: 24),
              SizedBox(height: 16),
              Skeleton(height: 140, radius: 24)
            ]),
            error: (e, _) => ListView(
              padding: const EdgeInsets.all(20),
              children: [
                ErrorState(
                  error: ApiException.from(e),
                  title: ApiException.from(e).failure == ApiFailure.notFound
                      ? 'This product is not available'
                      : null,
                  onRetry: () => ref.invalidate(productProvider(id)),
                ),
              ],
            ),
            data: (p) => _Body(product: p),
          ),
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.product});

  final Product product;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _busy = false;
  String? _error;

  Product get p => widget.product;

  Future<void> _order() async {
    final choice =
        await askOrder(context, title: p.title, price: p.price, stock: p.stock);
    if (choice == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final order = await ref.read(marketplaceRepositoryProvider).placeOrder(
            productId: p.id,
            quantity: choice.quantity,
            paymentMethod: choice.paymentMethod,
            deliveryArea: choice.deliveryArea,
            deliveryCity: choice.deliveryCity,
            deliveryPincode: choice.deliveryPincode,
            notes: choice.notes,
          );
      ref.invalidate(ordersProvider);
      ref.invalidate(productsProvider);
      ref.invalidate(productProvider(p.id));
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Order placed')));
      context.pushReplacement(Routes.order(order.id));
    } on ApiException catch (e) {
      if (mounted)
        setState(() => _error = e.fieldErrors.values.isNotEmpty
            ? e.fieldErrors.values.first
            : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _ask() async {
    final message = await askEnquiry(context, title: p.title);
    if (message == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(marketplaceRepositoryProvider).enquire(p.id, message);
      if (mounted)
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
            content: Text('Question sent. The seller has been told.')));
    } on ApiException catch (e) {
      if (mounted)
        setState(() => _error = e.fieldErrors.values.isNotEmpty
            ? e.fieldErrors.values.first
            : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Widget _title(ThemeData theme, IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(
          children: [
            Icon(icon, size: 20, color: theme.colorScheme.primary),
            const SizedBox(width: 8),
            Expanded(child: Semantics(header: true, child: Text(text, style: theme.textTheme.titleMedium))),
          ],
        ),
      );

  /// The fixed bar under the page: any problem with the last action, then the buttons.
  Widget _actionBar(ThemeData theme) {
    final Widget buttons = p.isMine
        ? OutlinedButton.icon(
            onPressed: () => context.push(Routes.editProduct(p.id)),
            icon: const Icon(Icons.edit_outlined),
            label: const Text('Edit this product'),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          )
        : Row(
            children: [
              Expanded(
                child: OutlinedButton.icon(
                  onPressed: _busy || p.status != 'active' ? null : _ask,
                  icon: const Icon(Icons.chat_bubble_outline),
                  label: const Text('Ask the seller'),
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52), padding: const EdgeInsets.symmetric(horizontal: 12)),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                flex: 2,
                child: FilledButton.icon(
                  onPressed: _busy || !p.canOrder ? null : _order,
                  icon: const Icon(Icons.shopping_bag_outlined),
                  label: Text(p.canOrder ? 'Order this' : 'Not available'),
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                ),
              ),
            ],
          );
    return Container(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(top: BorderSide(color: theme.colorScheme.outlineVariant)),
        boxShadow: const [BoxShadow(color: Color(0x14000000), blurRadius: 16, offset: Offset(0, -4))],
      ),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_error != null) ...[MessageBanner(message: _error!, tone: BannerTone.error), const SizedBox(height: 10)],
            buttons,
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final seller = [p.sellerName, p.sellerCity].where((x) => x != null && x.trim().isNotEmpty).join(', ');
    final initial = seller.isEmpty ? '?' : seller.characters.first.toUpperCase();
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            children: [
              _Gallery(photos: p.photos),
              const SizedBox(height: 16),
              GlassContainer(
                radius: 24,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(header: true, child: Text(p.title, style: theme.textTheme.headlineSmall)),
                    if (p.subtitle.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(p.subtitle, style: theme.textTheme.bodyMedium),
                    ],
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        StatusBadge(refurbishedLabel(p.condition), tone: productConditionTone(p.condition)),
                        if (p.categoryName != null) StatusBadge(p.categoryName!, tone: BadgeTone.neutral),
                        StatusBadge(p.stock > 0 ? stockText(p.stock) : 'Sold out', tone: p.stock > 0 ? BadgeTone.blue : BadgeTone.red),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text(formatPrice(p.price), style: theme.textTheme.headlineMedium?.copyWith(color: theme.colorScheme.primary)),
                  ],
                ),
              ),
              if ((p.refurbishmentInfo ?? '').trim().isNotEmpty) ...[
                const SizedBox(height: 16),
                GlassContainer(
                  radius: 24,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _title(theme, Icons.build_circle_outlined, 'What was done'),
                      Text(p.refurbishmentInfo!.trim(), style: theme.textTheme.bodyLarge),
                    ],
                  ),
                ),
              ],
              if (p.specs.isNotEmpty) ...[
                const SizedBox(height: 16),
                GlassContainer(
                  radius: 24,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _title(theme, Icons.memory_outlined, 'Specifications'),
                      for (var i = 0; i < p.specs.length; i++) ...[
                        if (i > 0) Divider(height: 1, color: theme.colorScheme.outlineVariant),
                        Padding(
                          padding: const EdgeInsets.symmetric(vertical: 10),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              SizedBox(width: 110, child: Text(p.specs.keys.elementAt(i), style: theme.textTheme.bodyMedium)),
                              Expanded(child: Text(p.specs.values.elementAt(i), style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600))),
                            ],
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
              if (seller.isNotEmpty) ...[
                const SizedBox(height: 16),
                GlassContainer(
                  radius: 24,
                  child: Row(
                    children: [
                      ExcludeSemantics(
                        child: Container(
                          width: 52,
                          height: 52,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.12), shape: BoxShape.circle),
                          child: Text(initial, style: theme.textTheme.titleLarge?.copyWith(color: theme.colorScheme.primary)),
                        ),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Sold by', style: theme.textTheme.bodySmall),
                            Text(seller, style: theme.textTheme.titleMedium),
                            const SizedBox(height: 4),
                            Row(
                              children: [
                                if (p.hasSellerRating) ...[
                                  Icon(Icons.star_rounded, size: 16, color: AppColors.adapt(context, AppColors.star)),
                                  const SizedBox(width: 3),
                                ],
                                Flexible(
                                  child: Text(
                                    p.hasSellerRating
                                        ? '${p.sellerRatingAvg.toStringAsFixed(1)} (${p.sellerRatingCount} ${p.sellerRatingCount == 1 ? 'review' : 'reviews'})'
                                        : 'No reviews yet',
                                    style: theme.textTheme.bodySmall,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: 16),
              const MessageBanner(message: 'You pay the seller directly, cash on delivery or another way you agree. The app never handles money.'),
              if (p.isMine) ...[const SizedBox(height: 12), const MessageBanner(message: 'This is your own product.')],
            ],
          ),
        ),
        _actionBar(theme),
      ],
    );
  }
}

/// The product's photos, one page each, with a counter and dots when there is more than one.
class _Gallery extends StatefulWidget {
  const _Gallery({required this.photos});

  final List<ListingPhoto> photos;

  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  final _controller = PageController();
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final photos = widget.photos;
    if (photos.isEmpty) {
      return SizedBox(height: 220, child: ClipRRect(borderRadius: BorderRadius.circular(26), child: const ListingPhotoView(photo: null)));
    }
    return SizedBox(
      height: 280,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(26),
        child: Stack(
          children: [
            PageView.builder(
              controller: _controller,
              itemCount: photos.length,
              onPageChanged: (i) => setState(() => _page = i),
              itemBuilder: (_, i) => ListingPhotoView(photo: photos[i], semanticLabel: 'Photo ${i + 1} of ${photos.length}'),
            ),
            if (photos.length > 1) ...[
              Positioned(right: 12, top: 12, child: PhotoPill('${_page + 1}/${photos.length}', dark: true)),
              Positioned(
                left: 0,
                right: 0,
                bottom: 12,
                child: ExcludeSemantics(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      for (var i = 0; i < photos.length; i++)
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          margin: const EdgeInsets.symmetric(horizontal: 3),
                          width: i == _page ? 18 : 7,
                          height: 7,
                          decoration: BoxDecoration(color: Colors.white.withValues(alpha: i == _page ? 0.95 : 0.55), borderRadius: BorderRadius.circular(4)),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
