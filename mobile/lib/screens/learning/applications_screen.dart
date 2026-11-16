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
import 'application_card.dart';

/// The statuses a student can filter by. The server takes one status at a time.
const applicationFilters = ['applied', 'accepted', 'in_progress', 'completed', 'rejected', 'withdrawn'];

/// A student's applications, newest first.
class ApplicationsScreen extends ConsumerWidget {
  const ApplicationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(applicationStatusFilterProvider);
    final set = ref.read(applicationStatusFilterProvider.notifier);
    final header = SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: [
          AppChip(label: 'All', selected: status.isEmpty, onTap: () => set.state = ''),
          for (final s in applicationFilters) ...[
            const SizedBox(width: 8),
            AppChip(label: applicationStatusLabel(s), selected: status == s, onTap: () => set.state = status == s ? '' : s),
          ],
        ],
      ),
    );
    return PagedList<Application>(
      provider: applicationsProvider,
      header: header,
      itemBuilder: (context, a) => ApplicationCard(application: a, onTap: () => context.push(Routes.application(a.id))),
      emptyTitle: status.isEmpty ? 'No applications yet' : 'Nothing here',
      emptyMessage: status.isEmpty ? 'Find a supervised task and apply. Your applications are tracked here.' : 'No application is at this step. Try another filter.',
      emptyIcon: Icons.assignment_outlined,
      emptyActionLabel: status.isEmpty ? 'Find a task' : null,
      onEmptyAction: status.isEmpty ? () => context.push(Routes.opportunities) : null,
      skeletonHeight: 90,
    );
  }
}

/// Full-screen page around [ApplicationsScreen]. [initialStatus] opens it on one step.
class ApplicationsPage extends ConsumerStatefulWidget {
  const ApplicationsPage({super.key, this.initialStatus = ''});

  final String initialStatus;

  @override
  ConsumerState<ApplicationsPage> createState() => _ApplicationsPageState();
}

class _ApplicationsPageState extends ConsumerState<ApplicationsPage> {
  @override
  void initState() {
    super.initState();
    // Set once the tree has finished building: providers may not change while it is being built.
    Future.microtask(() {
      if (mounted) ref.read(applicationStatusFilterProvider.notifier).state = widget.initialStatus;
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'My applications'),
        body: const AppBackground(child: SafeArea(child: ApplicationsScreen())),
      );
}
