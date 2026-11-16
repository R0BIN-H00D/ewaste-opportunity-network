import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/learning.dart';
import '../../providers/learning_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/paged_list.dart';
import 'opportunity_card.dart';

/// The status chips of a supervisor's own tasks.
final List<(String, String)> myTaskFilters = [('', 'All'), ...opportunityStatuses];

/// The tasks a technician posted: how many applicants wait on each, and a button to post another.
class MyTasksScreen extends ConsumerWidget {
  const MyTasksScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(myTaskStatusProvider);
    final header = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        FilledButton.icon(onPressed: () => context.push(Routes.newTask), icon: const Icon(Icons.add), label: const Text('Post a task'), style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48))),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(children: [
            for (var i = 0; i < myTaskFilters.length; i++) ...[
              if (i > 0) const SizedBox(width: 8),
              AppChip(label: myTaskFilters[i].$2, selected: status == myTaskFilters[i].$1, onTap: () => ref.read(myTaskStatusProvider.notifier).state = myTaskFilters[i].$1),
            ],
          ]),
        ),
      ],
    );
    return PagedList<Opportunity>(
      provider: myTasksProvider,
      header: header,
      itemBuilder: (context, o) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          OpportunityCard(opportunity: o, onTap: () => context.push(Routes.opportunity(o.id))),
          Padding(
            padding: const EdgeInsets.fromLTRB(8, 6, 8, 0),
            // The badge and count stay together at the left and the button at the right; at a large text size the button
            // drops to its own line instead of squeezing the text off the screen.
            child: SizedBox(
              width: double.infinity,
              child: Wrap(
                alignment: WrapAlignment.spaceBetween,
                crossAxisAlignment: WrapCrossAlignment.center,
                spacing: 8,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      StatusBadge(labelOf(opportunityStatuses, o.status), tone: o.status == 'open' ? BadgeTone.green : BadgeTone.neutral),
                      const SizedBox(width: 8),
                      Flexible(child: Text(o.pendingApplicants == 0 ? 'No applicants waiting' : '${o.pendingApplicants} ${o.pendingApplicants == 1 ? 'applicant' : 'applicants'} waiting')),
                    ],
                  ),
                  TextButton(onPressed: () => context.push(Routes.applicants(o.id)), child: const Text('Applicants')),
                ],
              ),
            ),
          ),
        ],
      ),
      emptyTitle: status.isEmpty ? 'You have not posted a task yet' : 'Nothing here',
      emptyMessage: status.isEmpty ? 'Post a supervised task for verified students. You supervise throughout and nothing hazardous is included.' : 'No tasks with this status.',
      emptyIcon: Icons.school_outlined,
      skeletonHeight: 110,
    );
  }
}

class MyTasksPage extends StatelessWidget {
  const MyTasksPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'Student tasks'),
        body: const AppBackground(child: SafeArea(child: MyTasksScreen())),
      );
}
