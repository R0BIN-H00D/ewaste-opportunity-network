import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../models/service_request.dart';
import '../../providers/technicians_controller.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/paged_list.dart';
import 'request_card.dart';

/// A technician's work: new requests they could take, the jobs in progress, or every job.
class JobsScreen extends ConsumerWidget {
  const JobsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(jobsFilterProvider);
    final set = ref.read(jobsFilterProvider.notifier);
    final header = Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        AppChip(label: 'New requests', selected: filter == JobsFilter.board, onTap: () => set.state = JobsFilter.board),
        AppChip(label: 'In progress', selected: filter == JobsFilter.active, onTap: () => set.state = JobsFilter.active),
        AppChip(label: 'All jobs', selected: filter == JobsFilter.all, onTap: () => set.state = JobsFilter.all),
      ],
    );
    final (title, message) = switch (filter) {
      JobsFilter.board => ('No new requests', 'Requests that match your skills and area show up here. Pull down to check again.'),
      JobsFilter.active => ('No jobs in progress', 'Jobs you accept appear here until they finish.'),
      JobsFilter.all => ('No jobs yet', 'Accept a request to start your first job.'),
    };
    return PagedList<ServiceRequest>(
      provider: jobsProvider,
      header: header,
      itemBuilder: (context, r) => Padding(padding: const EdgeInsets.only(bottom: 0), child: RequestCard(request: r, onTap: () => context.push(Routes.request(r.id)))),
      emptyTitle: title,
      emptyMessage: message,
      emptyIcon: Icons.work_outline,
      skeletonHeight: 100,
    );
  }
}

/// The page around [JobsScreen]. [initial] picks the tab it opens on.
class JobsPage extends ConsumerStatefulWidget {
  const JobsPage({super.key, this.initial = JobsFilter.board});

  final JobsFilter initial;

  @override
  ConsumerState<JobsPage> createState() => _JobsPageState();
}

class _JobsPageState extends ConsumerState<JobsPage> {
  @override
  void initState() {
    super.initState();
    // Providers cannot change while the tree is building, so set the starting tab right after.
    Future.microtask(() {
      if (mounted) ref.read(jobsFilterProvider.notifier).state = widget.initial;
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'Jobs'),
        body: const AppBackground(child: SafeArea(child: JobsScreen())),
      );
}
