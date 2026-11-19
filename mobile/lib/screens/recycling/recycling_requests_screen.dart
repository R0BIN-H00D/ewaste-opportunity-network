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
import '../../widgets/glass_container.dart';
import '../../widgets/page_banner.dart';
import '../../widgets/paged_list.dart';
import 'recycling_card.dart';

/// The statuses a person can filter by. The server takes one status at a time.
const recyclingFilters = ['requested', 'accepted', 'pickup_scheduled', 'received_at_center', 'completed'];

/// A person's recycling requests (or, for a recycling centre, the requests it received), newest activity first.
class RecyclingRequestsScreen extends ConsumerWidget {
  const RecyclingRequestsScreen({super.key});

  Future<void> _filter(BuildContext context, WidgetRef ref, String status) async {
    final selected = await showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (_) => _CentreStatusSheet(initial: status),
    );
    if (context.mounted && selected != null && selected != status) {
      ref.read(recyclingStatusFilterProvider.notifier).state = selected;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(recyclingStatusFilterProvider);
    final set = ref.read(recyclingStatusFilterProvider.notifier);
    final isCenter = ref.watch(authControllerProvider.select((s) => s.user?.role == UserRole.recycler));
    final total = isCenter ? ref.watch(recyclingRequestsProvider.select((state) => state.loaded ? state.total : null)) : null;
    final header = isCenter
        ? _CentreQueueHeader(status: status, total: total, onFilter: () => _filter(context, ref, status))
        : SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                AppChip(label: 'All', selected: status.isEmpty, onTap: () => set.state = ''),
                for (final s in recyclingFilters) ...[
                  const SizedBox(width: 8),
                  AppChip(
                      label: recyclingStatusLabel(s, center: isCenter),
                      selected: status == s,
                      onTap: () => set.state = status == s ? '' : s),
                ],
              ],
            ),
          );
    return PagedList<RecyclingRequest>(
      provider: recyclingRequestsProvider,
      header: header,
      itemBuilder: (context, r) {
        void open() => context.push(Routes.recyclingRequest(r.id));
        return isCenter ? CentreRecyclingCard(request: r, onTap: open) : RecyclingCard(request: r, onTap: open);
      },
      emptyTitle: status.isEmpty
          ? (isCenter ? 'No requests yet' : 'No recycling requests yet')
          : (isCenter ? 'No matching requests' : 'Nothing here'),
      emptyMessage: status.isEmpty
          ? (isCenter
              ? 'Requests from people who want to recycle devices appear here.'
              : 'Choose a recycling centre and send them your old devices.')
          : 'No request is at this step. Try another filter.',
      emptyIcon: Icons.recycling_outlined,
      emptyActionLabel: switch ((isCenter, status.isEmpty)) {
        (false, true) => 'Find a recycling centre',
        (true, false) => 'Clear filter',
        _ => null,
      },
      onEmptyAction: switch ((isCenter, status.isEmpty)) {
        (false, true) => () => context.push(Routes.recycling),
        (true, false) => () => set.state = '',
        _ => null,
      },
      skeletonHeight: 100,
    );
  }
}

class _CentreQueueHeader extends StatelessWidget {
  const _CentreQueueHeader({required this.status, required this.total, required this.onFilter});
  final String status;
  final int? total;
  final VoidCallback onFilter;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const PageBanner(
        icon: Icons.local_shipping_outlined,
        title: 'Collection queue',
        subtitle: 'Review incoming requests and track collections through recycling.',
      ),
      const SizedBox(height: 14),
      GlassContainer(
        radius: 20,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Wrap(
          alignment: WrapAlignment.spaceBetween,
          crossAxisAlignment: WrapCrossAlignment.center,
          spacing: 12,
          runSpacing: 6,
          children: [
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(status.isEmpty ? 'All requests' : recyclingStatusLabel(status, center: true), style: theme.textTheme.titleMedium),
              if (total != null)
                Text(
                  '${MaterialLocalizations.of(context).formatDecimal(total!)} ${total == 1 ? 'request' : 'requests'}',
                  style: theme.textTheme.bodySmall,
                ),
            ]),
            FilledButton.tonalIcon(
              onPressed: onFilter,
              icon: const Icon(Icons.tune_rounded),
              label: Text(status.isEmpty ? 'Filters' : 'Filters (1)'),
            ),
          ],
        ),
      ),
    ]);
  }
}

class _CentreStatusSheet extends StatefulWidget {
  const _CentreStatusSheet({required this.initial});
  final String initial;

  @override
  State<_CentreStatusSheet> createState() => _CentreStatusSheetState();
}

class _CentreStatusSheetState extends State<_CentreStatusSheet> {
  late String _status = widget.initial;

  @override
  Widget build(BuildContext context) => SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
          child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Filter recycling requests', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 12),
            Wrap(spacing: 8, runSpacing: 6, children: [
              for (final status in ['', ...recyclingStatusLabels.keys])
                ChoiceChip(
                  label: Text(status.isEmpty ? 'All statuses' : recyclingStatusLabel(status, center: true)),
                  selected: _status == status,
                  onSelected: (_) => setState(() => _status = status),
                ),
            ]),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(_status),
              child: const Text('Show results'),
            ),
          ]),
        ),
      );
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
