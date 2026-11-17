import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/listing.dart' show ListingPhoto;
import '../../models/refurbishment.dart';
import '../../providers/listings_controller.dart';
import '../../providers/refurbishment_providers.dart';
import '../../routes/route_paths.dart';
import '../../services/refurbishment_repository.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/message_button.dart';
import '../../widgets/listing_photo.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import '../devices/listing_card.dart' show conditionTone;
import '../requests/request_dialogs.dart';
import 'refurb_dialogs.dart';
import 'refurb_job_card.dart';

/// One plain sentence on where the job stands and what happens next, for whoever is looking.
String refurbJobHint(RefurbJob j) {
  final other = j.otherSideName;
  if (j.isRefurbisherView) {
    switch (j.status) {
      case 'offered':
        return 'Your offer is with the owner. You can withdraw it until they accept.';
      case 'accepted':
        return j.handover?.date == null ? 'The owner accepted. Arrange a time to collect the device.' : 'Collect the device at the arranged time, then both of you confirm the handover.';
      case 'collected':
        return 'You have the device. Add "before" photos and start the assessment.';
      case 'assessment':
        return 'Check what needs repairing or replacing, then start refurbishing.';
      case 'in_progress':
        return 'Refurbish the device. Add "after" photos when it is done, then move on to testing.';
      case 'testing':
        return 'Test everything. When it works, mark it ready to sell. You need at least one "before" and one "after" photo.';
      case 'ready_to_list':
        return 'Ready. Put it on sale in the shop with its refurbished label and condition.';
      case 'listed':
        return 'On sale in the shop.';
      default:
        return 'This job was cancelled.';
    }
  }
  switch (j.status) {
    case 'offered':
      return 'A refurbisher made an offer on your device. Accept it, or decline to keep the device listed.';
    case 'accepted':
      return '${other ?? 'The refurbisher'} will collect your device. Arrange a time, back up your data and reset the device first.';
    case 'collected':
    case 'assessment':
    case 'in_progress':
    case 'testing':
      return '${other ?? 'The refurbisher'} has your device and is working on it.';
    case 'ready_to_list':
      return 'The device is refurbished and about to go on sale.';
    case 'listed':
      return 'Your device is back on sale as a refurbished product. Thank you for keeping it out of the bin.';
    default:
      return 'This job was cancelled.';
  }
}

class RefurbJobDetailsScreen extends ConsumerWidget {
  const RefurbJobDetailsScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final job = ref.watch(refurbJobProvider(id));
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Refurbishment job'),
      body: AppBackground(
        child: SafeArea(
          child: job.when(
            skipLoadingOnReload: true,
            loading: () => ListView(padding: const EdgeInsets.all(20), children: const [Skeleton(height: 200, radius: 24), SizedBox(height: 16), Skeleton(height: 140, radius: 24)]),
            error: (e, _) => ListView(
              padding: const EdgeInsets.all(20),
              children: [
                ErrorState(
                  error: ApiException.from(e),
                  title: ApiException.from(e).failure == ApiFailure.notFound ? 'This job is not available' : null,
                  onRetry: () => ref.invalidate(refurbJobProvider(id)),
                ),
              ],
            ),
            data: (j) => RefreshIndicator(onRefresh: () => ref.read(refurbJobProvider(id).notifier).refresh(), child: _Body(job: j)),
          ),
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.job});

  final RefurbJob job;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _busy = false;
  String? _error;

  RefurbJob get j => widget.job;

  /// Runs one action with disabled buttons, shows what the server said if it refuses, and refreshes what the action may have changed.
  Future<void> _act(Future<RefurbJob> Function(RefurbishmentRepository repo) action, {String? done}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(refurbJobProvider(j.id).notifier).run((repo) => action(repo));
      ref.invalidate(listingsProvider(true));
      ref.invalidate(listingsProvider(false));
      if (done != null && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message);
      if (e.code == 'STALE_STATE' || e.failure == ApiFailure.conflict) await ref.read(refurbJobProvider(j.id).notifier).refresh();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _decide({required bool accept}) async {
    final ok = await askConfirm(
      context,
      title: accept ? 'Accept this offer?' : 'Decline this offer?',
      message: accept ? 'Your device is reserved for ${j.refurbisherLabel ?? 'this refurbisher'} and other offers are declined.' : 'They are told that you chose not to accept.',
      confirmLabel: accept ? 'Accept' : 'Decline',
    );
    if (!ok) return;
    await _act((repo) => repo.decide(j.id, accept: accept), done: accept ? 'Offer accepted' : 'Offer declined');
  }

  Future<void> _withdraw() async {
    final ok = await askConfirm(context, title: 'Withdraw your offer?', message: 'The owner will no longer see it. You can offer again later.', confirmLabel: 'Withdraw');
    if (!ok) return;
    await _act((repo) => repo.withdraw(j.id), done: 'Offer withdrawn');
  }

  Future<void> _schedule() async {
    final when = await pickPickupTime(context);
    if (when == null) return;
    await _act((repo) => repo.scheduleHandover(j.id, date: when), done: 'Collection time saved');
  }

  Future<void> _handover() async {
    if (j.isRefurbisherView) {
      final ok = await askConfirm(context, title: 'Did you collect it?', message: 'Confirm that you have received the device from ${j.ownerName ?? 'the owner'}.', confirmLabel: 'Yes, I have it');
      if (!ok) return;
      await _act((repo) => repo.confirmHandover(j.id), done: 'Handover confirmed');
      return;
    }
    if (!await askHandoverChecklist(context)) return;
    await _act((repo) => repo.confirmHandover(j.id, acknowledgeChecklist: true), done: 'Handover confirmed');
  }

  Future<void> _cancel() async {
    final answer = await askReason(context, title: 'Cancel this job?', confirmLabel: 'Cancel job', message: 'The other side is told. The device stays with its owner.');
    if (answer == null) return;
    await _act((repo) => repo.cancel(j.id, reason: answer.reason), done: 'Job cancelled');
  }

  Future<void> _advance() async {
    final next = j.nextStatus;
    if (next == null) return;
    final note = await askWorkNote(context, title: refurbAdvanceLabels[next] ?? 'Next step', confirmLabel: 'Continue', message: 'The owner is told about the progress.');
    if (note == null) return;
    await _act((repo) => repo.advance(j.id, status: next, note: note), done: 'Job updated');
  }

  Future<void> _photos() async {
    final upload = await askJobPhotos(context, stages: j.photoStages);
    if (upload == null) return;
    await _act((repo) => repo.addPhotos(j.id, stage: upload.stage, photos: upload.photos, note: upload.note), done: 'Photos added');
  }

  Future<void> _list() async {
    await context.push(Routes.newProductFor(j.id));
    if (mounted) await ref.read(refurbJobProvider(j.id).notifier).refresh();
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

  Widget _photoStrip(ThemeData theme, String title, List<ListingPhoto> photos) {
    if (photos.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: theme.textTheme.bodyMedium),
          const SizedBox(height: 6),
          SizedBox(
            height: 110,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: photos.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (_, i) => ClipRRect(borderRadius: BorderRadius.circular(16), child: SizedBox(width: 110, child: ListingPhotoView(photo: photos[i], semanticLabel: '$title photo ${i + 1} of ${photos.length}'))),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    Widget button(String label, IconData icon, VoidCallback onTap, {bool primary = false}) => Padding(
          padding: const EdgeInsets.only(top: 8),
          child: primary
              ? FilledButton.icon(onPressed: _busy ? null : onTap, icon: Icon(icon), label: Text(label), style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)))
              : OutlinedButton.icon(onPressed: _busy ? null : onTap, icon: Icon(icon), label: Text(label), style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48))),
        );

    final next = j.nextStatus;
    final buttons = <Widget>[
      if (j.can('decide')) ...[
        button('Accept this offer', Icons.check_circle_outline, () => _decide(accept: true), primary: true),
        button('Decline', Icons.close, () => _decide(accept: false)),
      ],
      if (j.can('withdraw')) button('Withdraw my offer', Icons.undo_outlined, _withdraw),
      if (j.can('schedule_handover')) button(j.handover?.date == null ? 'Arrange the collection' : 'Change the collection', Icons.event_available_outlined, _schedule, primary: j.handover?.date == null),
      if (j.can('confirm_handover')) button('Confirm the handover', Icons.handshake_outlined, _handover, primary: true),
      if (j.can('advance') && next != null) button(refurbAdvanceLabels[next] ?? 'Next step', Icons.arrow_forward, _advance, primary: true),
      if (j.can('add_photos') && j.photoStages.isNotEmpty) button('Add photos', Icons.add_a_photo_outlined, _photos),
      if (j.can('list_product')) button('Put it on sale', Icons.storefront_outlined, _list, primary: true),
      if (j.can('cancel')) button('Cancel job', Icons.cancel_outlined, _cancel),
    ];
    final handover = j.handover;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      children: [
        SizedBox(
          height: 200,
          child: j.device.photos.isEmpty
              ? ClipRRect(borderRadius: BorderRadius.circular(24), child: const ListingPhotoView(photo: null))
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: j.device.photos.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) => ClipRRect(
                    borderRadius: BorderRadius.circular(24),
                    child: SizedBox(width: j.device.photos.length == 1 ? MediaQuery.sizeOf(context).width - 40 : 260, child: ListingPhotoView(photo: j.device.photos[i], semanticLabel: 'Photo ${i + 1} of ${j.device.photos.length}')),
                  ),
                ),
        ),
        const SizedBox(height: 16),
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(header: true, child: Text(j.device.title, style: theme.textTheme.headlineSmall)),
              if (j.device.subtitle.isNotEmpty) Text(j.device.subtitle, style: theme.textTheme.bodyMedium),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [StatusBadge(labelOf(conditions, j.device.condition), tone: conditionTone(j.device.condition)), StatusBadge(refurbJobStatusText(j), tone: refurbJobTone(j))],
              ),
              const SizedBox(height: 12),
              Text(refurbJobHint(j), style: theme.textTheme.bodyLarge),
              if (_error != null) ...[const SizedBox(height: 12), MessageBanner(message: _error!, tone: BannerTone.error)],
              if (j.status == 'cancelled' && (j.cancelReason ?? '').trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                MessageBanner(message: 'Reason: ${j.cancelReason!.trim()}', tone: BannerTone.warning),
              ],
              ...buttons,
              Padding(padding: const EdgeInsets.only(top: 8), child: MessageButton(contextType: 'offer', contextId: j.id, label: 'Message ${j.otherSideName ?? (j.isRefurbisherView ? 'the owner' : 'the refurbisher')}')),
            ],
          ),
        ),
        const SizedBox(height: 16),
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(header: true, child: Text('The offer', style: theme.textTheme.titleLarge)),
              _fact(theme, 'Amount', j.offerAmount > 0 ? '${formatPrice(j.offerAmount)} paid to the owner by the refurbisher' : 'Free collection'),
              if ((j.offerMessage ?? '').trim().isNotEmpty) _fact(theme, 'Message', j.offerMessage!.trim()),
              if (j.ownerName != null) _fact(theme, 'Owner', j.ownerName!),
              if (j.refurbisherLabel != null) _fact(theme, 'Refurbisher', [j.refurbisherLabel, j.city].where((p) => p != null && p.trim().isNotEmpty).join(', ')),
              if (j.device.place.isNotEmpty) _fact(theme, 'Area', j.device.place),
              const SizedBox(height: 8),
              Text('The app never handles money. Agree any payment directly.', style: theme.textTheme.bodyMedium),
            ],
          ),
        ),
        if (handover?.date != null || j.status == 'accepted') ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text('Collection', style: theme.textTheme.titleLarge)),
                if (handover?.date != null) _fact(theme, 'When', formatDateTime(handover!.date)) else Text('Not arranged yet.', style: theme.textTheme.bodyMedium),
                if ((handover?.timeSlot ?? '').trim().isNotEmpty) _fact(theme, 'Time slot', handover!.timeSlot!.trim()),
                if ((handover?.notes ?? '').trim().isNotEmpty) _fact(theme, 'Notes', handover!.notes!.trim()),
                if (j.status == 'accepted' && handover?.date != null) ...[
                  const SizedBox(height: 8),
                  _check(theme, 'You confirmed the handover', j.isRefurbisherView ? j.refurbisherConfirmed : j.ownerConfirmed),
                  _check(theme, j.isRefurbisherView ? 'The owner confirmed' : 'The refurbisher confirmed', j.isRefurbisherView ? j.ownerConfirmed : j.refurbisherConfirmed),
                ],
              ],
            ),
          ),
        ],
        if (j.beforePhotos.isNotEmpty || j.afterPhotos.isNotEmpty || j.workLog.isNotEmpty) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text('The work', style: theme.textTheme.titleLarge)),
                _photoStrip(theme, 'Before', j.beforePhotos),
                _photoStrip(theme, 'After', j.afterPhotos),
                for (final w in j.workLog)
                  Padding(
                    padding: const EdgeInsets.only(top: 10),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [Text(w.text, style: theme.textTheme.bodyLarge), if (w.at != null) Text(formatDateTime(w.at), style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12))],
                    ),
                  ),
              ],
            ),
          ),
        ],
        if (j.history.isNotEmpty) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text('History', style: theme.textTheme.titleLarge)),
                for (final s in j.history.reversed)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Padding(padding: EdgeInsets.only(top: 3), child: Icon(Icons.circle, size: 10)),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(refurbStatusLabel(s.status, owner: j.isOwnerView), style: theme.textTheme.bodyLarge),
                              if ((s.note ?? '').trim().isNotEmpty) Text(s.note!.trim(), style: theme.textTheme.bodyMedium),
                              if (s.at != null) Text(formatDateTime(s.at), style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12)),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}
