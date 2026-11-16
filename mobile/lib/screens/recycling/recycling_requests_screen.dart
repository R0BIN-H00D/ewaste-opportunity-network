import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/recycling.dart';
import '../../models/user.dart';
import '../../providers/auth_controller.dart';
import '../../providers/recycling_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/paged_list.dart';
import 'recycling_card.dart';

/// The statuses a person can filter by. The server takes one status at a time.
const recyclingFilters = ['requested', 'accepted', 'pickup_scheduled', 'received_at_center', 'completed'];

/// A person's recycling requests (or, for a recycling centre, the requests it received), newest activity first.
class RecyclingRequestsScreen extends ConsumerWidget {
  const RecyclingRequestsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(recyclingStatusFilterProvider);
    final set = ref.read(recyclingStatusFilterProvider.notifier);
    final isCenter = ref.watch(authControllerProvider.select((s) => s.user?.role == UserRole.recycler));
    final header = SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          AppChip(label: 'All', selected: status.isEmpty, onTap: () => set.state = ''),
          for (final s in recyclingFilters) ...[
            const SizedBox(width: 8),
            AppChip(label: recyclingStatusLabel(s, center: isCenter), selected: status == s, onTap: () => set.state = status == s ? '' : s),
          ],
        ],
      ),
    );
    return PagedList<RecyclingRequest>(
      provider: recyclingRequestsProvider,
      header: header,
      itemBuilder: (context, r) => RecyclingCard(request: r, onTap: () => context.push(Routes.recyclingRequest(r.id))),
      emptyTitle: status.isEmpty ? (isCenter ? 'No requests yet' : 'No recycling requests yet') : 'Nothing here',
      emptyMessage: status.isEmpty
          ? (isCenter ? 'Requests from people who want to recycle devices appear here.' : 'Choose a recycling centre and send them your old devices.')
          : 'No request is at this step. Try another filter.',
      emptyIcon: Icons.recycling_outlined,
      emptyActionLabel: status.isEmpty && !isCenter ? 'Find a recycling centre' : null,
      onEmptyAction: status.isEmpty && !isCenter ? () => context.push(Routes.recycling) : null,
      skeletonHeight: 100,
    );
  }
}

/// Full-screen page around [RecyclingRequestsScreen]. [initialStatus] opens it on one step (for the recycler's quick actions).
class RecyclingRequestsPage extends ConsumerStatefulWidget {
  const RecyclingRequestsPage({super.key, this.initialStatus = ''});

  final String initialStatus;

  @override
  ConsumerState<RecyclingRequestsPage> createState() => _RecyclingRequestsPageState();
}

class _RecyclingRequestsPageState extends ConsumerState<RecyclingRequestsPage> {
  @override
  void initState() {
    super.initState();
    // Set once the tree has finished building: providers may not change while it is being built.
    Future.microtask(() {
      if (mounted) ref.read(recyclingStatusFilterProvider.notifier).state = widget.initialStatus;
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'Recycling requests'),
        body: const AppBackground(child: SafeArea(child: RecyclingRequestsScreen())),
      );
}
