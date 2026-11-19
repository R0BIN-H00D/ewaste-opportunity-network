import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/theme/app_colors.dart';
import '../../core/format.dart';
import '../../models/marketplace.dart';
import '../../providers/listings_controller.dart';
import '../../providers/marketplace_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/page_banner.dart';
import '../../widgets/paged_list.dart';
import 'product_card.dart';
import 'shop_filter_sheet.dart';

/// The refurbished shop: a search box, one Filters button (category, condition, sort) and a card for each product.
class MarketplaceScreen extends ConsumerStatefulWidget {
  const MarketplaceScreen({super.key});

  @override
  ConsumerState<MarketplaceScreen> createState() => _MarketplaceScreenState();
}

class _MarketplaceScreenState extends ConsumerState<MarketplaceScreen> {
  final _search = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _setQuery(String text) => ref.read(productQueryProvider.notifier).update((q) => q.copyWith(q: text));

  void _onChanged(String text) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => _setQuery(text));
  }

  Future<void> _openFilters() async {
    final categories = ref.read(categoriesProvider).valueOrNull ?? const [];
    final chosen = await ShopFilterSheet.show(context, ref.read(productQueryProvider), categories);
    if (chosen == null) return;
    ref.read(productQueryProvider.notifier).update((q) => q.copyWith(category: chosen.category, condition: chosen.condition, sort: chosen.sort));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final query = ref.watch(productQueryProvider);
    final notifier = ref.read(productQueryProvider.notifier);
    final categories = ref.watch(categoriesProvider).valueOrNull ?? const [];
    final sortChanged = query.sort != 'newest';
    final count = query.activeFilters + (sortChanged ? 1 : 0);
    final categoryName = categories.where((c) => c.slug == query.category).map((c) => c.name).firstOrNull ?? query.category;

    final header = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const PageBanner(icon: Icons.storefront_outlined, title: 'Give devices a second life', subtitle: 'Checked and repaired by refurbishers. You pay the seller directly.'),
        const SizedBox(height: 16),
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _search,
                textInputAction: TextInputAction.search,
                onChanged: _onChanged,
                onSubmitted: (text) {
                  _debounce?.cancel();
                  _setQuery(text);
                },
                decoration: InputDecoration(
                  labelText: 'Search by name, brand or model',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _search.text.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Clear search',
                          icon: const Icon(Icons.close),
                          onPressed: () {
                            _search.clear();
                            _setQuery('');
                            setState(() {});
                          },
                        ),
                ),
              ),
            ),
            const SizedBox(width: 10),
            _FilterButton(count: count, onTap: _openFilters),
          ],
        ),
        if (count > 0) ...[
          const SizedBox(height: 12),
          // What is switched on, each one removable with a tap.
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              if (query.category.isNotEmpty) _ActiveFilter(label: categoryName, onRemove: () => notifier.update((q) => q.copyWith(category: ''))),
              if (query.condition.isNotEmpty) _ActiveFilter(label: labelOf(productConditions, query.condition), onRemove: () => notifier.update((q) => q.copyWith(condition: ''))),
              if (sortChanged) _ActiveFilter(label: labelOf(productSorts, query.sort), onRemove: () => notifier.update((q) => q.copyWith(sort: 'newest'))),
              TextButton(
                onPressed: () => notifier.update((q) => q.copyWith(category: '', condition: '', sort: 'newest')),
                style: TextButton.styleFrom(minimumSize: const Size(48, 36), padding: const EdgeInsets.symmetric(horizontal: 8), textStyle: theme.textTheme.labelMedium),
                child: const Text('Clear filters'),
              ),
            ],
          ),
        ],
      ],
    );

    return PagedList<Product>(
      provider: productsProvider,
      header: header,
      itemBuilder: (context, p) => ProductCard(product: p, onTap: () => context.push(Routes.product(p.id))),
      emptyTitle: 'Nothing for sale here',
      emptyMessage: 'Try a different search, or clear a filter.',
      emptyIcon: Icons.storefront_outlined,
      skeletonHeight: 120,
    );
  }
}

/// A square button beside the search box that opens the filters, with a count of how many are on.
class _FilterButton extends StatelessWidget {
  const _FilterButton({required this.count, required this.onTap});

  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final on = count > 0;
    return Semantics(
      button: true,
      label: on ? 'Filters, $count on' : 'Filters',
      excludeSemantics: true,
      child: Material(
        color: on ? theme.colorScheme.primary : theme.colorScheme.surface.withValues(alpha: 0.5),
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(borderRadius: BorderRadius.circular(14), border: Border.all(color: on ? theme.colorScheme.primary : theme.colorScheme.outline)),
            child: Stack(
              alignment: Alignment.center,
              children: [
                Icon(Icons.tune_rounded, color: on ? theme.colorScheme.onPrimary : theme.colorScheme.onSurface),
                if (on)
                  Positioned(
                    right: 6,
                    top: 6,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                      alignment: Alignment.center,
                      decoration: const BoxDecoration(color: AppColors.accent, shape: BoxShape.circle),
                      child: Text('$count', style: theme.textTheme.labelSmall?.copyWith(color: AppColors.onAccent, fontSize: 10.5, fontWeight: FontWeight.w800, height: 1.2)),
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

/// One switched-on filter as a small pill; tapping it switches that filter off.
class _ActiveFilter extends StatelessWidget {
  const _ActiveFilter({required this.label, required this.onRemove});

  final String label;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      button: true,
      label: 'Remove filter: $label',
      excludeSemantics: true,
      child: Material(
        color: theme.colorScheme.primary.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(20),
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: onRemove,
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 36),
            child: Padding(
              padding: const EdgeInsets.only(left: 12, right: 8),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(label, style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.primary, fontWeight: FontWeight.w700)),
                  const SizedBox(width: 4),
                  Icon(Icons.close_rounded, size: 16, color: theme.colorScheme.primary),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class MarketplacePage extends StatelessWidget {
  const MarketplacePage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'Refurbished shop'),
        body: const AppBackground(child: SafeArea(child: MarketplaceScreen())),
      );
}
