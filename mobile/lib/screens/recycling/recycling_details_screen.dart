import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/recycling.dart';
import '../../providers/listings_controller.dart';
import '../../providers/recycling_providers.dart';
import '../../services/recycling_repository.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/listing_photo.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import '../requests/request_dialogs.dart';
import 'recycling_card.dart';
import 'recycling_dialogs.dart';

/// One plain sentence on where the request stands and what happens next, for whoever is looking.
String recyclingHint(RecyclingRequest r) {
  final center = r.centerName ?? 'The centre';
  if (r.isCenterView) {
    switch (r.status) {
      case 'requested':
        return 'Accept to arrange a pickup, or decline with a reason.';
      case 'accepted':
        return 'Arrange a pickup. The sender\'s exact address is shown here until the devices are collected.';
      case 'pickup_scheduled':
        return r.centerConfirmed ? 'You confirmed the handover. Waiting for the sender to confirm too.' : 'Confirm once you have collected the devices.';
      case 'collected':
        return 'Collected. Mark them received when they reach your centre.';
      case 'received_at_center':
        return 'Record what you recover, then mark the request processed.';
      case 'processed':
        return 'Complete the request to finish. The weights you entered become the sender\'s verified impact.';
      case 'completed':
        return 'Finished. The recovered materials are recorded below.';
      case 'rejected':
        return 'You declined this request.';
      default:
        return 'This request was cancelled.';
    }
  }
  switch (r.status) {
    case 'requested':
      return 'Waiting for $center to accept. You can cancel until the handover starts.';
    case 'accepted':
      return '$center accepted. They will arrange a pickup.';
    case 'pickup_scheduled':
      return r.requesterConfirmed ? 'You confirmed the handover. Waiting for $center to confirm too.' : 'Hand over your devices at the pickup, then confirm here. Back up and reset them first.';
    case 'collected':
      return 'Handed over. $center will confirm when they reach the centre.';
    case 'received_at_center':
      return '$center has your devices and is sorting and weighing the materials.';
    case 'processed':
      return 'Processed. Waiting for $center to complete the request.';
    case 'completed':
      return 'Done. What was recovered is below, and it counts towards your impact.';
    case 'rejected':
      return '$center declined this request.';
    default:
      return 'This request was cancelled.';
  }
}

class RecyclingDetailsScreen extends ConsumerWidget {
  const RecyclingDetailsScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final request = ref.watch(recyclingRequestProvider(id));
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Recycling request'),
      body: AppBackground(
        child: SafeArea(
          child: request.when(
            skipLoadingOnReload: true,
            loading: () => ListView(padding: const EdgeInsets.all(20), children: const [Skeleton(height: 110, radius: 24), SizedBox(height: 16), Skeleton(height: 160, radius: 24)]),
            error: (e, _) => ListView(
              padding: const EdgeInsets.all(20),
              children: [
                ErrorState(
                  error: ApiException.from(e),
                  title: ApiException.from(e).failure == ApiFailure.notFound ? 'This request is not available' : null,
                  onRetry: () => ref.invalidate(recyclingRequestProvider(id)),
                ),
              ],
            ),
            data: (r) => RefreshIndicator(onRefresh: () => ref.read(recyclingRequestProvider(id).notifier).refresh(), child: _Body(request: r)),
          ),
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.request});

  final RecyclingRequest request;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _busy = false;
  String? _error;

  RecyclingRequest get r => widget.request;

  /// Runs one action with a disabled button, shows what the server said if it refuses, and refreshes what the action may have changed.
  Future<void> _act(Future<RecyclingRequest> Function(RecyclingRepository repo) action, {String? done}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(recyclingRequestProvider(r.id).notifier).run((repo) => action(repo));
      // A held device is released or finished by some steps, so the device lists may be out of date.
      ref.invalidate(listingsProvider(true));
      ref.invalidate(listingsProvider(false));
      if (done != null && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message);
      // The other side changed it first: show what it looks like now.
      if (e.code == 'STALE_STATE' || e.failure == ApiFailure.conflict) await ref.read(recyclingRequestProvider(r.id).notifier).refresh();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _accept() => _act((repo) => repo.accept(r.id), done: 'Request accepted');

  Future<void> _reject() async {
    final answer = await askReason(context, title: 'Decline this request?', confirmLabel: 'Decline', required: true, message: 'The sender sees your reason.');
    if (answer == null) return;
    await _act((repo) => repo.reject(r.id, answer.reason), done: 'Request declined');
  }

  Future<void> _schedule() async {
    final when = await pickPickupTime(context);
    if (when == null) return;
    await _act((repo) => repo.schedulePickup(r.id, date: when), done: 'Pickup saved');
  }

  Future<void> _handover() async {
    if (r.isCenterView) {
      final ok = await askConfirm(context, title: 'Have you collected the devices?', message: 'Confirm that ${r.requesterName ?? 'the sender'} has handed the devices over to you.', confirmLabel: 'Yes, I have them');
      if (!ok) return;
      await _act((repo) => repo.confirmHandover(r.id), done: 'Handover confirmed');
      return;
    }
    if (!await askHandoverChecklist(context)) return;
    await _act((repo) => repo.confirmHandover(r.id, acknowledgeChecklist: true), done: 'Handover confirmed');
  }

  Future<void> _received() async {
    final ok = await askConfirm(context, title: 'Devices received?', message: 'Confirm that the devices have reached your centre.', confirmLabel: 'Yes, received');
    if (!ok) return;
    await _act((repo) => repo.markReceived(r.id), done: 'Marked received');
  }

  Future<void> _materials() async {
    final answer = await askMaterials(context, current: r.materials, reportNotes: r.reportNotes);
    if (answer == null) return;
    await _act((repo) => repo.saveMaterials(r.id, answer.materials, reportNotes: answer.reportNotes), done: 'Materials saved');
  }

  Future<void> _process() async {
    final ok = await askConfirm(context, title: 'Mark as processed?', message: 'This says the devices have been dismantled and the materials recorded.', confirmLabel: 'Yes, processed');
    if (!ok) return;
    await _act((repo) => repo.markProcessed(r.id), done: 'Marked processed');
  }

  Future<void> _complete() async {
    final ok = await askConfirm(
      context,
      title: 'Complete this request?',
      message: 'This closes it. The weights you measured become the sender\'s verified impact, so check them first.',
      confirmLabel: 'Complete',
    );
    if (!ok) return;
    await _act((repo) => repo.complete(r.id), done: 'Request completed');
  }

  Future<void> _cancel() async {
    final answer = await askReason(
      context,
      title: 'Cancel this request?',
      confirmLabel: 'Cancel request',
      message: r.isCenterView ? 'The sender is told and can choose another centre.' : 'Your device, if you linked one, is listed again.',
    );
    if (answer == null) return;
    await _act((repo) => repo.cancel(r.id, reason: answer.reason), done: 'Request cancelled');
  }

  Widget _fact(ThemeData theme, String label, String value) => Padding(
        padding: const EdgeInsets.only(top: 6),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SizedBox(width: 110, child: Text(label, style: theme.textTheme.bodyMedium)),
            Expanded(child: Text(value, style: theme.textTheme.bodyLarge)),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final who = r.isCenterView ? (r.requesterName ?? 'Sender') : (r.centerName ?? 'Recycling centre');
    final hasMaterials = r.materials.isNotEmpty;

    Widget button(String label, IconData icon, VoidCallback onTap, {bool primary = false}) {
      return Padding(
        padding: const EdgeInsets.only(top: 8),
        child: primary
            ? FilledButton.icon(onPressed: _busy ? null : onTap, icon: Icon(icon), label: Text(label), style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)))
            : OutlinedButton.icon(onPressed: _busy ? null : onTap, icon: Icon(icon), label: Text(label), style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48))),
      );
    }

    final buttons = <Widget>[
      if (r.can('accept')) button('Accept request', Icons.check_circle_outline, _accept, primary: true),
      if (r.can('schedule_pickup')) button(r.status == 'pickup_scheduled' ? 'Change the pickup' : 'Schedule pickup', Icons.event_available_outlined, _schedule, primary: r.status == 'accepted'),
      if (r.can('confirm_handover')) button('Confirm the handover', Icons.handshake_outlined, _handover, primary: true),
      if (r.can('mark_received')) button('Mark as received', Icons.inventory_2_outlined, _received, primary: true),
      if (r.can('record_materials')) button(hasMaterials ? 'Edit recovered materials' : 'Record recovered materials', Icons.scale_outlined, _materials, primary: !hasMaterials),
      if (r.can('process')) button('Mark as processed', Icons.build_outlined, _process, primary: true),
      if (r.can('complete')) button('Complete the request', Icons.task_alt_outlined, _complete, primary: true),
      if (r.can('reject')) button('Decline request', Icons.block_outlined, _reject),
      if (r.can('cancel')) button('Cancel request', Icons.cancel_outlined, _cancel),
    ];

    final address = r.pickupAddress;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      children: [
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Semantics(header: true, child: Text(who, style: theme.textTheme.titleLarge))),
                  StatusBadge(recyclingStatusLabel(r.status, center: r.isCenterView), tone: recyclingTone(r)),
                ],
              ),
              Text(r.refNo, style: theme.textTheme.bodyMedium),
              const SizedBox(height: 8),
              Text(recyclingHint(r), style: theme.textTheme.bodyLarge),
              if (_error != null) ...[const SizedBox(height: 12), MessageBanner(message: _error!, tone: BannerTone.error)],
              if ((r.status == 'rejected' || r.status == 'cancelled') && (r.cancelReason ?? '').trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                MessageBanner(message: 'Reason: ${r.cancelReason!.trim()}', tone: BannerTone.warning),
              ],
              ...buttons,
            ],
          ),
        ),
        const SizedBox(height: 16),
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(header: true, child: Text('The devices', style: theme.textTheme.titleLarge)),
              _fact(theme, 'How many', '${r.deviceCount}'),
              if (r.categoryNames.isNotEmpty) _fact(theme, 'Kinds', r.categoryNames),
              if (r.listingTitle != null) _fact(theme, 'Your listing', r.listingTitle!),
              if (r.preferredDate != null) _fact(theme, 'Preferred date', formatDate(r.preferredDate)),
              if ((r.notes ?? '').trim().isNotEmpty) _fact(theme, 'Notes', r.notes!.trim()),
              if (r.photos.isNotEmpty) ...[
                const SizedBox(height: 12),
                SizedBox(
                  height: 72,
                  child: ListView.separated(
                    scrollDirection: Axis.horizontal,
                    itemCount: r.photos.length,
                    separatorBuilder: (_, __) => const SizedBox(width: 8),
                    itemBuilder: (_, i) => ClipRRect(borderRadius: BorderRadius.circular(12), child: SizedBox(width: 72, height: 72, child: ListingPhotoView(photo: r.photos[i], semanticLabel: 'Photo ${i + 1} of ${r.photos.length}'))),
                  ),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 16),
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(header: true, child: Text('Pickup', style: theme.textTheme.titleLarge)),
              _fact(theme, 'Area', r.pickupArea ?? ''),
              if (address != null && address.trim().isNotEmpty) _fact(theme, 'Address', address.trim()),
              if (address == null && r.isCenterView && !r.isFinished)
                Padding(padding: const EdgeInsets.only(top: 8), child: Text('The exact address is shown once you accept.', style: theme.textTheme.bodyMedium)),
              if (r.pickup?.date != null) ...[
                _fact(theme, 'When', formatDateTime(r.pickup!.date)),
                if ((r.pickup!.timeSlot ?? '').trim().isNotEmpty) _fact(theme, 'Time slot', r.pickup!.timeSlot!.trim()),
                if ((r.pickup!.notes ?? '').trim().isNotEmpty) _fact(theme, 'Pickup notes', r.pickup!.notes!.trim()),
              ],
              if (r.status == 'pickup_scheduled') ...[
                const SizedBox(height: 8),
                _check(theme, 'You confirmed the handover', r.isCenterView ? r.centerConfirmed : r.requesterConfirmed),
                _check(theme, r.isCenterView ? 'The sender confirmed' : 'The centre confirmed', r.isCenterView ? r.requesterConfirmed : r.centerConfirmed),
              ],
            ],
          ),
        ),
        if (hasMaterials) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text('Recovered materials', style: theme.textTheme.titleLarge)),
                const SizedBox(height: 6),
                for (final m in r.materials)
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SizedBox(width: 110, child: Text(labelOf(materialTypes, m.type), style: theme.textTheme.bodyLarge)),
                        Expanded(
                          child: Text(
                            [
                              m.actualKg == null ? 'not weighed' : 'measured ${formatKg(m.actualKg!)}',
                              if (m.estimatedKg != null) 'estimated ${formatKg(m.estimatedKg!)}',
                            ].join(' · '),
                            style: theme.textTheme.bodyMedium,
                          ),
                        ),
                      ],
                    ),
                  ),
                const Divider(height: 24),
                Text('Measured total: ${formatKg(r.totalActualKg)}', style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600)),
                if (r.totalEstimatedKg > 0) Text('Estimated total (not weighed): ${formatKg(r.totalEstimatedKg)}', style: theme.textTheme.bodyMedium),
                if ((r.reportNotes ?? '').trim().isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(r.reportNotes!.trim(), style: theme.textTheme.bodyMedium)),
              ],
            ),
          ),
        ],
        if (r.history.isNotEmpty) ...[const SizedBox(height: 16), _Timeline(steps: r.history, center: r.isCenterView)],
      ],
    );
  }

  Widget _check(ThemeData theme, String label, bool done) => Padding(
        padding: const EdgeInsets.only(top: 4),
        child: Row(
          children: [
            Icon(done ? Icons.check_circle : Icons.radio_button_unchecked, size: 20, color: done ? theme.colorScheme.primary : theme.disabledColor),
            const SizedBox(width: 8),
            Expanded(child: Text('$label${done ? '' : ' (not yet)'}', style: theme.textTheme.bodyMedium)),
          ],
        ),
      );
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.steps, required this.center});

  final List<RecyclingStep> steps;
  final bool center;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final latestFirst = steps.reversed.toList();
    return GlassContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(header: true, child: Text('History', style: theme.textTheme.titleLarge)),
          const SizedBox(height: 10),
          for (var i = 0; i < latestFirst.length; i++)
            Semantics(
              label: [
                '${recyclingStatusLabel(latestFirst[i].status, center: center)}. ${formatDateTime(latestFirst[i].at)}.',
                if ((latestFirst[i].note ?? '').trim().isNotEmpty) '${latestFirst[i].note!.trim()}.',
              ].join(' '),
              excludeSemantics: true,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Icon(i == 0 ? Icons.radio_button_checked : Icons.circle, size: i == 0 ? 16 : 10, color: i == 0 ? theme.colorScheme.primary : theme.disabledColor),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(recyclingStatusLabel(latestFirst[i].status, center: center), style: theme.textTheme.bodyLarge?.copyWith(fontWeight: i == 0 ? FontWeight.w700 : FontWeight.w500)),
                          Text(formatDateTime(latestFirst[i].at), style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12)),
                          if ((latestFirst[i].note ?? '').trim().isNotEmpty) Text(latestFirst[i].note!.trim(), style: theme.textTheme.bodyMedium),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }
}
