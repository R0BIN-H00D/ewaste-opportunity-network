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

/// The person's repair requests, newest activity first. "Open" hides the ones that have finished.
class RequestsScreen extends ConsumerWidget {
  const RequestsScreen({super.key});

  Future<void> _openFilters(BuildContext context, WidgetRef ref, bool activeOnly) async {
    final selection = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (context) => _RequestFilterSheet(activeOnly: activeOnly),
    );
    if (context.mounted && selection != null && selection != activeOnly) {
      ref.read(requestsActiveOnlyProvider.notifier).state = selection;
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activeOnly = ref.watch(requestsActiveOnlyProvider);
    final header = Wrap(
      alignment: WrapAlignment.spaceBetween,
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 12,
      runSpacing: 8,
      children: [
        Text(activeOnly ? 'Open requests' : 'All requests', style: Theme.of(context).textTheme.titleSmall),
        FilledButton.tonalIcon(
          onPressed: () => _openFilters(context, ref, activeOnly),
          icon: const Icon(Icons.tune_rounded),
          label: Text(activeOnly ? 'Filters (1)' : 'Filters'),
        ),
      ],
    );
    return PagedList<ServiceRequest>(
      provider: requestsProvider,
      header: header,
      itemBuilder: (context, r) => RequestCard(request: r, onTap: () => context.push(Routes.request(r.id))),
      emptyTitle: activeOnly ? 'No open requests' : 'No repair requests yet',
      emptyMessage: activeOnly ? 'Everything you asked for has finished.' : 'Ask a technician to repair a device you have listed.',
      emptyIcon: Icons.build_circle_outlined,
      emptyActionLabel: activeOnly ? null : 'Find a technician',
      onEmptyAction: activeOnly ? null : () => context.push(Routes.technicians),
      skeletonHeight: 100,
    );
  }
}

class _RequestFilterSheet extends StatefulWidget {
  const _RequestFilterSheet({required this.activeOnly});

  final bool activeOnly;

  @override
  State<_RequestFilterSheet> createState() => _RequestFilterSheetState();
}

class _RequestFilterSheetState extends State<_RequestFilterSheet> {
  late bool _activeOnly = widget.activeOnly;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Filter requests', style: textTheme.titleLarge),
            const SizedBox(height: 16),
            Text('Status', style: textTheme.titleSmall),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                AppChip(label: 'All', selected: !_activeOnly, onTap: () => setState(() => _activeOnly = false)),
                AppChip(label: 'Open', selected: _activeOnly, onTap: () => setState(() => _activeOnly = true)),
              ],
            ),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(_activeOnly),
              child: const Text('Show results'),
            ),
          ],
        ),
      ),
    );
  }
}

class RequestsPage extends StatelessWidget {
  const RequestsPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'My requests'),
        body: const AppBackground(child: SafeArea(child: RequestsScreen())),
      );
}
