import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/marketplace.dart';
import '../../providers/refurbishment_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/paged_list.dart';
import '../marketplace/product_card.dart';

/// The status chips of the refurbisher's product list.
final List<(String, String)> myProductFilters = [('', 'All'), ...productStatuses];

BadgeTone productStatusTone(String status) => status == 'active' ? BadgeTone.green : status == 'sold' ? BadgeTone.neutral : BadgeTone.amber;

/// The refurbisher's own products: all, on sale, hidden or sold out. Tapping one edits it.
class MyProductsScreen extends ConsumerWidget {
  const MyProductsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(myProductStatusProvider);
    final header = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FilledButton.icon(
          onPressed: () => context.push(Routes.newProduct),
          icon: const Icon(Icons.add),
          label: const Text('List a product'),
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
        ),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            for (var i = 0; i < myProductFilters.length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              AppChip(label: myProductFilters[i].$2, selected: status == myProductFilters[i].$1, onTap: () => ref.read(myProductStatusProvider.notifier).state = myProductFilters[i].$1),
            ],
          ]),
        ),
      ],
    );
    return PagedList<Product>(
      provider: myProductsProvider,
      header: header,
      itemBuilder: (context, p) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ProductCard(product: p, onTap: () => context.push(Routes.editProduct(p.id))),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 6, 8, 0),
            // A Wrap, not a Row: at a large text size the stock text moves to the next line instead of overflowing.
            child: Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              runSpacing: 4,
              children: [StatusBadge(labelOf(productStatuses, p.status), tone: productStatusTone(p.status)), Text(stockText(p.stock))],
            ),
          ),
        ],
      ),
      emptyTitle: status.isEmpty ? 'You have not listed a product yet' : 'Nothing here',
      emptyMessage: status.isEmpty ? 'Finish a refurbishment job and put the device on sale, or list a product you already have.' : 'No products with this status.',
      emptyIcon: Icons.storefront_outlined,
      skeletonHeight: 110,
    );
  }
}

class MyProductsPage extends StatelessWidget {
  const MyProductsPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'My products'),
        body: const AppBackground(child: SafeArea(child: MyProductsScreen())),
      );
}
