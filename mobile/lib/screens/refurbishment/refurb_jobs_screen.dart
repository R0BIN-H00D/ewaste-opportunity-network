import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/refurbishment.dart';
import '../../providers/refurbishment_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/paged_list.dart';
import 'refurb_job_card.dart';

/// The status chips of the job list: all, then each step in order.
final List<(String, String)> refurbJobFilters = [
  ('', 'All'),
  for (final s in ['offered', 'accepted', 'collected', 'assessment', 'in_progress', 'testing', 'ready_to_list', 'listed', 'cancelled']) (s, refurbStatusLabels[s]!),
];

/// Refurbishment jobs, with chips for the side (jobs I do, devices I gave) and for the status.
class RefurbJobsScreen extends ConsumerWidget {
  const RefurbJobsScreen({super.key, this.showScope = true});

  /// Owners who are not refurbishers only ever see the owner side, so the side chips are hidden for them.
  final bool showScope;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(refurbJobStatusProvider);
    final scope = ref.watch(refurbJobScopeProvider);
    Widget row(List<Widget> chips) => SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [for (var i = 0; i < chips.length; i++) ...[if (i > 0) const SizedBox(width: 8), chips[i]]]),
        );
    final header = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        if (showScope) ...[
          row([
            AppChip(label: 'Jobs I do', selected: scope.isEmpty || scope == 'refurbisher', onTap: () => ref.read(refurbJobScopeProvider.notifier).state = 'refurbisher'),
            AppChip(label: 'My devices', selected: scope == 'owner', onTap: () => ref.read(refurbJobScopeProvider.notifier).state = 'owner'),
          ]),
          const SizedBox(height: 12),
        ],
        row([for (final (value, label) in refurbJobFilters) AppChip(label: label, selected: status == value, onTap: () => ref.read(refurbJobStatusProvider.notifier).state = value)]),
      ],
    );
    return PagedList<RefurbJob>(
      provider: refurbJobsProvider,
      header: header,
      itemBuilder: (context, j) => RefurbJobCard(job: j, onTap: () => context.push(Routes.refurbJob(j.id))),
      emptyTitle: status.isEmpty ? 'No jobs yet' : 'Nothing here',
      emptyMessage: status.isEmpty ? 'Make an offer on a device from the Devices to refurbish list.' : 'No jobs are at this step.',
      emptyIcon: Icons.build_circle_outlined,
      emptyActionLabel: status.isEmpty && scope != 'owner' ? 'Find devices' : null,
      onEmptyAction: () => context.push(Routes.refurbOpportunities),
      skeletonHeight: 100,
    );
  }
}

class RefurbJobsPage extends ConsumerStatefulWidget {
  const RefurbJobsPage({super.key, this.initialStatus = ''});

  final String initialStatus;

  @override
  ConsumerState<RefurbJobsPage> createState() => _RefurbJobsPageState();
}

class _RefurbJobsPageState extends ConsumerState<RefurbJobsPage> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) ref.read(refurbJobStatusProvider.notifier).state = widget.initialStatus;
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'Refurbishment jobs'),
        body: const AppBackground(child: SafeArea(child: RefurbJobsScreen())),
      );
}
