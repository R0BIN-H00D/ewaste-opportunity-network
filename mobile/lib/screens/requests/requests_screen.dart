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

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activeOnly = ref.watch(requestsActiveOnlyProvider);
    final set = ref.read(requestsActiveOnlyProvider.notifier);
    final header = Row(
      children: [
        AppChip(label: 'All', selected: !activeOnly, onTap: () => set.state = false),
        const SizedBox(width: 8),
        AppChip(label: 'Open', selected: activeOnly, onTap: () => set.state = true),
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

class RequestsPage extends StatelessWidget {
  const RequestsPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'My requests'),
        body: const AppBackground(child: SafeArea(child: RequestsScreen())),
      );
}
