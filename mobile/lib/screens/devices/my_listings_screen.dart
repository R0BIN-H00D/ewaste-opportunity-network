import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../providers/listings_controller.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_chip.dart';
import 'listings_view.dart';

const _statusFilters = ['listed', 'in_service', 'completed', 'withdrawn'];

/// The signed-in person's own listings, with a quick filter by status.
class MyListingsScreen extends ConsumerWidget {
  const MyListingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(listingsProvider(true).select((s) => s.query.status));
    final controller = ref.read(listingsProvider(true).notifier);

    final header = SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          AppChip(label: 'All', selected: status.isEmpty, onTap: () => controller.setQuery((q) => q.copyWith(status: ''))),
          for (final s in _statusFilters) ...[
            const SizedBox(width: 8),
            AppChip(label: listingStatusLabels[s]!, selected: status == s, onTap: () => controller.setQuery((q) => q.copyWith(status: s))),
          ],
        ],
      ),
    );

    return ListingsView(
      mine: true,
      header: header,
      emptyTitle: status.isEmpty ? 'You have not listed anything yet' : 'Nothing with this status',
      emptyMessage: status.isEmpty ? 'List an old phone, laptop or appliance to repair it, give it a second life or recycle it.' : 'Try another status.',
      emptyActionLabel: status.isEmpty ? 'List a device' : null,
      onEmptyAction: status.isEmpty ? () => context.push(Routes.newListing) : null,
    );
  }
}
