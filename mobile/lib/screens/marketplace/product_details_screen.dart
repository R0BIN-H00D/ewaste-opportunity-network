import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
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
            loading: () => ListView(padding: const EdgeInsets.all(20), children: const [Skeleton(height: 220, radius: 24), SizedBox(height: 16), Skeleton(height: 140, radius: 24)]),
            error: (e, _) => ListView(
              padding: const EdgeInsets.all(20),
              children: [
                ErrorState(
                  error: ApiException.from(e),
                  title: ApiException.from(e).failure == ApiFailure.notFound ? 'This product is not available' : null,
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
    final choice = await askOrder(context, title: p.title, price: p.price, stock: p.stock);
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
            notes: choice.notes,
          );
      ref.invalidate(ordersProvider);
      ref.invalidate(productsProvider);
      ref.invalidate(productProvider(p.id));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Order placed')));
      context.pushReplacement(Routes.order(order.id));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message);
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
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Question sent. The seller has been told.')));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final seller = [p.sellerName, p.sellerCity].where((x) => x != null && x.trim().isNotEmpty).join(', ');
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      children: [
        SizedBox(
          height: 220,
          child: p.photos.isEmpty
              ? ClipRRect(borderRadius: BorderRadius.circular(24), child: const ListingPhotoView(photo: null))
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: p.photos.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) => ClipRRect(
                    borderRadius: BorderRadius.circular(24),
                    child: SizedBox(width: p.photos.length == 1 ? MediaQuery.sizeOf(context).width - 40 : 280, child: ListingPhotoView(photo: p.photos[i], semanticLabel: 'Photo ${i + 1} of ${p.photos.length}')),
                  ),
                ),
        ),
        const SizedBox(height: 16),
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(header: true, child: Text(p.title, style: theme.textTheme.headlineSmall)),
              if (p.subtitle.isNotEmpty) Text(p.subtitle, style: theme.textTheme.bodyMedium),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  StatusBadge(refurbishedLabel(p.condition), tone: productConditionTone(p.condition)),
                  if (p.categoryName != null) StatusBadge(p.categoryName!, tone: BadgeTone.neutral),
                  StatusBadge(p.stock > 0 ? stockText(p.stock) : 'Sold out', tone: p.stock > 0 ? BadgeTone.blue : BadgeTone.red),
                ],
              ),
              const SizedBox(height: 12),
              Text(formatPrice(p.price), style: theme.textTheme.headlineMedium?.copyWith(color: theme.colorScheme.primary)),
            ],
          ),
        ),
        if ((p.refurbishmentInfo ?? '').trim().isNotEmpty) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text('What was done', style: theme.textTheme.titleLarge)),
                const SizedBox(height: 8),
                Text(p.refurbishmentInfo!.trim(), style: theme.textTheme.bodyLarge),
              ],
            ),
          ),
        ],
        if (p.specs.isNotEmpty) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text('Specifications', style: theme.textTheme.titleLarge)),
                for (final e in p.specs.entries)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(width: 110, child: Text(e.key, style: theme.textTheme.bodyMedium)),
                        Expanded(child: Text(e.value, style: theme.textTheme.bodyLarge)),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
        if (seller.isNotEmpty) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Row(
              children: [
                Icon(Icons.storefront_outlined, color: theme.colorScheme.primary),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Sold by', style: theme.textTheme.bodyMedium),
                      Text(seller, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16)),
                      Text(p.hasSellerRating ? '${p.sellerRatingAvg.toStringAsFixed(1)} (${p.sellerRatingCount} ${p.sellerRatingCount == 1 ? 'review' : 'reviews'})' : 'No reviews yet', style: theme.textTheme.bodyMedium),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        const MessageBanner(message: 'You pay the seller directly, cash on delivery or another way you agree. The app never handles money.'),
        if (_error != null) ...[const SizedBox(height: 12), MessageBanner(message: _error!, tone: BannerTone.error)],
        const SizedBox(height: 16),
        if (p.isMine) ...[
          const MessageBanner(message: 'This is your own product.'),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => context.push(Routes.editProduct(p.id)),
            icon: const Icon(Icons.edit_outlined),
            label: const Text('Edit this product'),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          ),
        ] else ...[
          FilledButton.icon(
            onPressed: _busy || !p.canOrder ? null : _order,
            icon: const Icon(Icons.shopping_bag_outlined),
            label: Text(p.canOrder ? 'Order this' : 'Not available'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          ),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _busy || p.status != 'active' ? null : _ask,
            icon: const Icon(Icons.chat_bubble_outline),
            label: const Text('Ask the seller'),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          ),
        ],
      ],
    );
  }
}
