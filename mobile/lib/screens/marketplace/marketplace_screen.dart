import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/marketplace.dart';
import '../../providers/listings_controller.dart';
import '../../providers/marketplace_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/paged_list.dart';
import 'product_card.dart';

/// The refurbished shop: search, a category, the disclosed condition and a sort order, and a card for each product.
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

  Widget _row(List<Widget> chips) => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [for (var i = 0; i < chips.length; i++) ...[if (i > 0) const SizedBox(width: 8), chips[i]]]),
      );

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(productQueryProvider);
    final notifier = ref.read(productQueryProvider.notifier);
    final categories = ref.watch(categoriesProvider).valueOrNull ?? const [];

    final header = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
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
        if (categories.isNotEmpty) ...[
          const SizedBox(height: 12),
          _row([
            AppChip(label: 'All devices', selected: query.category.isEmpty, onTap: () => notifier.update((q) => q.copyWith(category: ''))),
            for (final c in categories)
              AppChip(label: c.name, selected: query.category == c.slug, onTap: () => notifier.update((q) => q.copyWith(category: query.category == c.slug ? '' : c.slug))),
          ]),
        ],
        const SizedBox(height: 8),
        _row([
          AppChip(label: 'Any condition', selected: query.condition.isEmpty, onTap: () => notifier.update((q) => q.copyWith(condition: ''))),
          for (final (value, label) in productConditions)
            AppChip(label: label, selected: query.condition == value, onTap: () => notifier.update((q) => q.copyWith(condition: query.condition == value ? '' : value))),
        ]),
        const SizedBox(height: 8),
        _row([
          for (final (value, label) in productSorts) AppChip(label: label, selected: query.sort == value, onTap: () => notifier.update((q) => q.copyWith(sort: value))),
        ]),
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

class MarketplacePage extends StatelessWidget {
  const MarketplacePage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'Refurbished shop'),
        body: const AppBackground(child: SafeArea(child: MarketplaceScreen())),
      );
}
