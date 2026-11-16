import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/marketplace.dart';
import '../../models/user.dart';
import '../../providers/auth_controller.dart';
import '../../providers/marketplace_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/paged_list.dart';
import 'order_card.dart';

/// The statuses a person can filter by. The server takes one status at a time.
const orderFilters = ['placed', 'confirmed', 'ready', 'delivered', 'completed', 'cancelled'];

/// A person's orders (or, for a refurbisher, the orders they received), newest activity first.
class OrdersScreen extends ConsumerWidget {
  const OrdersScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(orderStatusFilterProvider);
    final set = ref.read(orderStatusFilterProvider.notifier);
    final isSeller = ref.watch(authControllerProvider.select((s) => s.user?.role == UserRole.refurbisher));
    final header = SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          AppChip(label: 'All', selected: status.isEmpty, onTap: () => set.state = ''),
          for (final s in orderFilters) ...[
            const SizedBox(width: 8),
            AppChip(label: orderStatusLabel(s, seller: isSeller), selected: status == s, onTap: () => set.state = status == s ? '' : s),
          ],
        ],
      ),
    );
    return PagedList<Order>(
      provider: ordersProvider,
      header: header,
      itemBuilder: (context, o) => OrderCard(order: o, onTap: () => context.push(Routes.order(o.id))),
      emptyTitle: status.isEmpty ? 'No orders yet' : 'Nothing here',
      emptyMessage: status.isEmpty
          ? (isSeller ? 'Orders for your products appear here.' : 'Browse the refurbished shop and order a device.')
          : 'No order is at this step. Try another filter.',
      emptyIcon: Icons.shopping_bag_outlined,
      emptyActionLabel: status.isEmpty && !isSeller ? 'Open the shop' : null,
      onEmptyAction: status.isEmpty && !isSeller ? () => context.push(Routes.shop) : null,
      skeletonHeight: 100,
    );
  }
}

/// Full-screen page around [OrdersScreen]. [initialStatus] opens it on one step.
class OrdersPage extends ConsumerStatefulWidget {
  const OrdersPage({super.key, this.initialStatus = ''});

  final String initialStatus;

  @override
  ConsumerState<OrdersPage> createState() => _OrdersPageState();
}

class _OrdersPageState extends ConsumerState<OrdersPage> {
  @override
  void initState() {
    super.initState();
    // Set once the tree has finished building: providers may not change while it is being built.
    Future.microtask(() {
      if (mounted) ref.read(orderStatusFilterProvider.notifier).state = widget.initialStatus;
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'Orders'),
        body: const AppBackground(child: SafeArea(child: OrdersScreen())),
      );
}
