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

/// "Filters" with a count of what is switched on, for the top of a list.
class _FiltersButton extends StatelessWidget {
  const _FiltersButton({required this.count, required this.onPressed});

  final int count;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) => FilledButton.tonalIcon(
        onPressed: onPressed,
        icon: const Icon(Icons.tune_rounded),
        label: Text(count > 0 ? 'Filters ($count)' : 'Filters'),
      );
}

/// Find repair requests: new requests a technician could take, with filters for the kind of device, the city, on-site repairs
/// and the order. The filters work on the requests that have loaded.
class FindRequestsScreen extends ConsumerWidget {
  const FindRequestsScreen({super.key});

  Future<void> _openFilters(BuildContext context, WidgetRef ref) async {
    final items = ref.read(jobsProvider).items;
    final chosen = await showModalBottomSheet<FindFilters>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _FindFilterSheet(
        initial: ref.read(findFiltersProvider),
        categories: {for (final r in items) if (r.deviceCategory.isNotEmpty) r.deviceCategory}.toList()..sort(),
        cities: {for (final r in items) if (r.deviceCity.isNotEmpty) r.deviceCity}.toList()..sort(),
      ),
    );
    if (chosen != null) ref.read(findFiltersProvider.notifier).state = chosen;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filters = ref.watch(findFiltersProvider);
    final total = ref.watch(jobsProvider.select((state) => state.total));
    final header = Wrap(
      alignment: WrapAlignment.spaceBetween,
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 12,
      runSpacing: 8,
      children: [
        Text(total == 1 ? '1 request' : '$total requests', style: Theme.of(context).textTheme.titleSmall),
        _FiltersButton(count: filters.count, onPressed: () => _openFilters(context, ref)),
      ],
    );
    return PagedList<ServiceRequest>(
      provider: jobsProvider,
      header: header,
      itemBuilder: (context, r) => RequestCard(request: r, onTap: () => context.push(Routes.request(r.id))),
      emptyTitle: 'No new requests',
      emptyMessage: 'Requests that match your skills and area show up here. Pull down to check again.',
      emptyIcon: Icons.inbox_outlined,
      skeletonHeight: 100,
      itemFilter: filters.matches,
      itemSort: filters.compare,
      onClearFilters: () => ref.read(findFiltersProvider.notifier).state = const FindFilters(),
    );
  }
}

class _FindFilterSheet extends StatefulWidget {
  const _FindFilterSheet({required this.initial, required this.categories, required this.cities});

  final FindFilters initial;
  final List<String> categories;
  final List<String> cities;

  @override
  State<_FindFilterSheet> createState() => _FindFilterSheetState();
}

class _FindFilterSheetState extends State<_FindFilterSheet> {
  late FindFilters _f = widget.initial;

  FindFilters _with({String? category, String? city, bool? onSiteOnly, bool? oldestFirst}) => FindFilters(
        category: category ?? _f.category,
        city: city ?? _f.city,
        onSiteOnly: onSiteOnly ?? _f.onSiteOnly,
        oldestFirst: oldestFirst ?? _f.oldestFirst,
      );

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    Widget group(String title, List<Widget> chips) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: textTheme.titleSmall),
            const SizedBox(height: 8),
            Wrap(spacing: 8, runSpacing: 8, children: chips),
            const SizedBox(height: 20),
          ],
        );
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Filter requests', style: textTheme.titleLarge),
            const SizedBox(height: 16),
            if (widget.categories.isNotEmpty)
              group('Device type', [
                AppChip(label: 'All types', selected: _f.category.isEmpty, onTap: () => setState(() => _f = _with(category: ''))),
                for (final c in widget.categories) AppChip(label: c, selected: _f.category == c, onTap: () => setState(() => _f = _with(category: c))),
              ]),
            if (widget.cities.isNotEmpty)
              group('City', [
                AppChip(label: 'All cities', selected: _f.city.isEmpty, onTap: () => setState(() => _f = _with(city: ''))),
                for (final c in widget.cities) AppChip(label: c, selected: _f.city == c, onTap: () => setState(() => _f = _with(city: c))),
              ]),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('On-site repairs only'),
              value: _f.onSiteOnly,
              onChanged: (on) => setState(() => _f = _with(onSiteOnly: on)),
            ),
            const SizedBox(height: 8),
            group('Sort by', [
              AppChip(label: 'Newest first', selected: !_f.oldestFirst, onTap: () => setState(() => _f = _with(oldestFirst: false))),
              AppChip(label: 'Oldest first', selected: _f.oldestFirst, onTap: () => setState(() => _f = _with(oldestFirst: true))),
            ]),
            FilledButton(onPressed: () => Navigator.of(context).pop(_f), child: const Text('Show results')),
            TextButton(onPressed: () => Navigator.of(context).pop(const FindFilters()), child: const Text('Clear all filters')),
          ],
        ),
      ),
    );
  }
}

/// The page around [FindRequestsScreen]. It asks the shared jobs list for the board.
class FindRequestsPage extends ConsumerStatefulWidget {
  const FindRequestsPage({super.key});

  @override
  ConsumerState<FindRequestsPage> createState() => _FindRequestsPageState();
}

class _FindRequestsPageState extends ConsumerState<FindRequestsPage> {
  @override
  void initState() {
    super.initState();
    // Providers cannot change while the tree is building, so set the list right after.
    Future.microtask(() {
      if (!mounted) return;
      ref.read(jobsFilterProvider.notifier).state = JobsFilter.board;
      ref.read(findFiltersProvider.notifier).state = const FindFilters();
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'Find repair requests'),
        body: const AppBackground(child: SafeArea(child: FindRequestsScreen())),
      );
}

/// My repair jobs: the jobs a technician has accepted. The Filters button chooses between the ones in progress and all of them.
class MyJobsScreen extends ConsumerWidget {
  const MyJobsScreen({super.key});

  Future<void> _openFilters(BuildContext context, WidgetRef ref, JobsFilter now) async {
    final chosen = await showModalBottomSheet<JobsFilter>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _ShowSheet(now: now),
    );
    if (chosen != null) ref.read(jobsFilterProvider.notifier).state = chosen;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final filter = ref.watch(jobsFilterProvider);
    final all = filter == JobsFilter.all;
    final header = Wrap(
      alignment: WrapAlignment.spaceBetween,
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 12,
      runSpacing: 8,
      children: [
        Text(all ? 'All jobs' : 'Jobs in progress', style: Theme.of(context).textTheme.titleSmall),
        _FiltersButton(count: all ? 1 : 0, onPressed: () => _openFilters(context, ref, filter)),
      ],
    );
    return PagedList<ServiceRequest>(
      provider: jobsProvider,
      header: header,
      itemBuilder: (context, r) => RequestCard(request: r, onTap: () => context.push(Routes.request(r.id))),
      emptyTitle: all ? 'No jobs yet' : 'No jobs in progress',
      emptyMessage: all ? 'Accept a request to start your first job.' : 'Jobs you accept appear here until they finish.',
      emptyIcon: Icons.work_outline,
      emptyActionLabel: 'Find repair requests',
      onEmptyAction: () => context.push(Routes.jobsBoard),
      skeletonHeight: 100,
    );
  }
}

class _ShowSheet extends StatefulWidget {
  const _ShowSheet({required this.now});

  final JobsFilter now;

  @override
  State<_ShowSheet> createState() => _ShowSheetState();
}

class _ShowSheetState extends State<_ShowSheet> {
  late JobsFilter _show = widget.now == JobsFilter.all ? JobsFilter.all : JobsFilter.active;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Filter jobs', style: textTheme.titleLarge),
            const SizedBox(height: 16),
            Text('Show', style: textTheme.titleSmall),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                AppChip(label: 'Active jobs', selected: _show == JobsFilter.active, onTap: () => setState(() => _show = JobsFilter.active)),
                AppChip(label: 'All jobs', selected: _show == JobsFilter.all, onTap: () => setState(() => _show = JobsFilter.all)),
              ],
            ),
            const SizedBox(height: 24),
            FilledButton(onPressed: () => Navigator.of(context).pop(_show), child: const Text('Show results')),
            TextButton(onPressed: () => Navigator.of(context).pop(JobsFilter.active), child: const Text('Clear all filters')),
          ],
        ),
      ),
    );
  }
}

/// The page around [MyJobsScreen]. It opens on the jobs in progress.
class MyJobsPage extends ConsumerStatefulWidget {
  const MyJobsPage({super.key, this.initial = JobsFilter.active});

  final JobsFilter initial;

  @override
  ConsumerState<MyJobsPage> createState() => _MyJobsPageState();
}

class _MyJobsPageState extends ConsumerState<MyJobsPage> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) ref.read(jobsFilterProvider.notifier).state = widget.initial;
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'My repair jobs'),
        body: const AppBackground(child: SafeArea(child: MyJobsScreen())),
      );
}
