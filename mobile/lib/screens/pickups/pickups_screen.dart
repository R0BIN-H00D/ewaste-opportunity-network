import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/pickup.dart';
import '../../providers/pickup_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/paged_list.dart';

/// What a pickup is about, in a word the person would use.
String pickupKindLabel(String kind) =>
    const {
      'repair': 'Repair',
      'donation': 'Donation',
      'refurbishment': 'Refurbishment',
      'recycling': 'Recycling'
    }[kind] ??
    'Pickup';

/// Where the request behind a pickup lives in the app.
String pickupRoute(PickupItem p) {
  switch (p.kind) {
    case 'donation':
      return Routes.donation(p.contextId);
    case 'refurbishment':
      return Routes.refurbJob(p.contextId);
    case 'recycling':
      return Routes.recyclingRequest(p.contextId);
    default:
      return Routes.request(p.contextId);
  }
}

/// "Confirmed", "Moved", ...: where the pickup stands, or "Time passed" when it never happened. [now] is for tests.
String pickupStatusLabel(PickupItem p, {DateTime? now}) {
  final gone = p.date != null && p.date!.isBefore(now ?? DateTime.now());
  if (const {'requested', 'confirmed', 'rescheduled'}.contains(p.status) && gone) {
    return 'Time passed';
  }
  switch (p.status) {
    case 'requested':
      return 'Waiting';
    case 'confirmed':
      return 'Confirmed';
    case 'rescheduled':
      return 'Moved';
    case 'collected':
      return 'Handed over';
    case 'cancelled':
      return 'Cancelled';
    default:
      return p.status;
  }
}

/// The person's pickups, collections and handovers: what is coming, and what is over. Opening one goes to its request,
/// where it can be moved (up to 3 times, until 2 hours before it starts) or the handover confirmed.
class PickupsScreen extends ConsumerWidget {
  const PickupsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final upcoming = ref.watch(pickupsUpcomingProvider);
    final set = ref.read(pickupsUpcomingProvider.notifier);
    final header = Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        AppChip(
            label: 'Coming up',
            selected: upcoming,
            onTap: () => set.state = true),
        const SizedBox(width: 8),
        AppChip(
            label: 'Past', selected: !upcoming, onTap: () => set.state = false),
      ],
    );
    return PagedList<PickupItem>(
      provider: pickupsProvider,
      header: header,
      itemBuilder: (context, p) => _PickupCard(pickup: p),
      emptyTitle: upcoming ? 'Nothing coming up' : 'Nothing here yet',
      emptyMessage: upcoming
          ? 'When a pickup, collection or handover is arranged, it appears here.'
          : 'Finished and cancelled pickups appear here.',
      emptyIcon: Icons.event_available_outlined,
      skeletonHeight: 110,
    );
  }
}

class _PickupCard extends ConsumerStatefulWidget {
  const _PickupCard({required this.pickup});

  final PickupItem pickup;

  @override
  ConsumerState<_PickupCard> createState() => _PickupCardState();
}

class _PickupCardState extends ConsumerState<_PickupCard> {
  bool _busy = false;

  /// Accepts the time the other side set or changed.
  Future<void> _confirm() async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(pickupRepositoryProvider).confirm(widget.pickup.id);
      await ref.read(pickupsProvider.notifier).load();
      messenger.showSnackBar(const SnackBar(content: Text('Time confirmed')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final p = widget.pickup;
    final when = [formatDateTime(p.date), if (p.timeSlot.isNotEmpty) p.timeSlot]
        .join(' · ');
    final tone = p.status == 'collected'
        ? BadgeTone.green
        : (p.status == 'cancelled' ? BadgeTone.neutral : BadgeTone.blue);
    final active =
        const {'requested', 'confirmed', 'rescheduled'}.contains(p.status) &&
            !(p.date?.isBefore(DateTime.now()) ?? false);
    final change = !active
        ? null
        : p.canChange
            ? 'Can be changed ${p.reschedulesLeft == 1 ? 'once more' : '${p.reschedulesLeft} more times'}, until ${formatDateTime(p.changeableUntil)}'
            : (p.reschedulesLeft == 0
                ? 'Cannot be changed again'
                : 'Too close to the start to change');
    return Semantics(
      button: true,
      child: GlassContainer(
        padding: EdgeInsets.zero,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            onTap: () => context.push(pickupRoute(p)),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                          child: Text(p.title,
                              style: theme.textTheme.titleMedium)),
                      const SizedBox(width: 8),
                      StatusBadge(pickupStatusLabel(p), tone: tone),
                    ],
                  ),
                  const SizedBox(height: 4),
                  Text(
                      [
                        pickupKindLabel(p.kind),
                        if (p.counterpartName.isNotEmpty)
                          (p.asRequester
                              ? 'with ${p.counterpartName}'
                              : 'for ${p.counterpartName}')
                      ].join(' · '),
                      style: theme.textTheme.bodyMedium),
                  const SizedBox(height: 8),
                  Row(children: [
                    const Icon(Icons.event_outlined, size: 18),
                    const SizedBox(width: 6),
                    Expanded(
                        child: Text(when, style: theme.textTheme.bodyLarge)),
                  ]),
                  if (p.addressArea.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Row(children: [
                      const Icon(Icons.place_outlined, size: 18),
                      const SizedBox(width: 6),
                      Expanded(child: Text(p.addressArea))
                    ]),
                  ],
                  if (change != null) ...[
                    const SizedBox(height: 8),
                    Text(change, style: theme.textTheme.bodySmall)
                  ],
                  if (p.awaitingMe) ...[
                    const SizedBox(height: 8),
                    Text(
                        '${p.counterpartName.isEmpty ? 'The other person' : p.counterpartName} suggested this time. Confirm it, or open the request to suggest another.',
                        style: theme.textTheme.bodyMedium),
                    const SizedBox(height: 8),
                    FilledButton(
                        onPressed: _busy ? null : _confirm,
                        child: Text(_busy ? 'Confirming...' : 'Confirm this time')),
                  ] else if (p.proposedByMe && p.status == 'rescheduled') ...[
                    const SizedBox(height: 8),
                    Text(
                        'Waiting for ${p.counterpartName.isEmpty ? 'the other person' : p.counterpartName} to confirm this time.',
                        style: theme.textTheme.bodySmall),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class PickupsPage extends StatelessWidget {
  const PickupsPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'Pickups'),
        body: const AppBackground(child: SafeArea(child: PickupsScreen())),
      );
}
