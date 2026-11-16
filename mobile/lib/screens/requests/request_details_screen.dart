import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/listing.dart';
import '../../models/service_request.dart';
import '../../providers/listings_controller.dart';
import '../../providers/technicians_controller.dart';
import '../../routes/route_paths.dart';
import '../../services/request_repository.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/listing_photo.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import 'request_card.dart';
import 'request_dialogs.dart';
import 'technician_forms.dart';

/// What happens next, in plain words, for the technician.
String technicianHint(ServiceRequest r) {
  switch (r.status) {
    case 'request_submitted':
      return r.can('accept') ? 'A customer asked for your help. Accept to see where the device is, or decline with a reason.' : 'Waiting for the request to be accepted.';
    case 'technician_assigned':
      return r.onSite ? 'Start the diagnosis when you are at the device.' : 'Agree a pickup time so you can collect the device.';
    case 'device_collection_pending':
      return 'Collect the device at the pickup time. Then you and the owner each confirm the handover.';
    case 'device_collected':
      return 'Start the diagnosis, then send a quote.';
    case 'diagnosis_in_progress':
      return 'Find out what is wrong and send a quote. Post updates as you go.';
    case 'quotation_submitted':
    case 'customer_approval_pending':
      return 'Waiting for the owner to approve your quote. Nothing starts until they do.';
    case 'repair_in_progress':
      return 'Repair the device, post updates, and mark it done with a photo when it is finished.';
    case 'repair_completed':
      return r.onSite ? 'Waiting for the owner to confirm the repair.' : 'Bring the device back and tell the owner when to expect it.';
    case 'device_delivery_pending':
      return 'Hand the device back and confirm the handover. The owner confirms too.';
    case 'device_delivered':
      return 'Waiting for the owner to confirm the repair is done.';
    case 'service_completed':
      return 'All done. The owner pays you directly, as agreed in the quote.';
    case 'rejected':
      return 'You declined this request.';
    case 'cancelled':
      return r.technicianHasDevice ? 'The owner cancelled this request. You still have the device: please arrange to return it.' : 'The owner cancelled this request.';
    default:
      return '';
  }
}

/// What happens next, in plain words, for whoever is looking.
String nextStepHint(ServiceRequest r) {
  if (r.isTechnicianView) return technicianHint(r);
  switch (r.status) {
    case 'request_submitted':
      return r.technicianName != null ? 'Waiting for ${r.technicianName} to accept.' : 'Waiting for a suitable technician to accept.';
    case 'technician_assigned':
      return r.onSite ? 'The technician will come and check your device.' : 'Choose a pickup time so the technician can collect your device.';
    case 'device_collection_pending':
      return 'Hand the device over at the pickup time. Then you and the technician each confirm the handover.';
    case 'device_collected':
    case 'diagnosis_in_progress':
      return 'The technician is checking what is wrong and will send you a quote.';
    case 'quotation_submitted':
    case 'customer_approval_pending':
      return 'Look at the quote below. Nothing starts until you approve it.';
    case 'repair_in_progress':
      return 'The technician is repairing your device.';
    case 'repair_completed':
      return r.onSite ? 'Check the repair, then confirm it is done.' : 'The technician will arrange to bring your device back.';
    case 'device_delivery_pending':
      final back = r.returnSchedule?.date;
      return back == null
          ? 'Confirm the handover when you have your device back.'
          : 'Expect it back on ${formatDateTime(back)}. Confirm the handover when you have it.';
    case 'device_delivered':
      return 'Check the repair, then confirm it is done.';
    case 'service_completed':
      return 'All done. Pay the technician directly, as agreed in the quote.';
    case 'rejected':
      return 'The technician could not take this one. Your device is listed again, so you can ask someone else.';
    case 'cancelled':
      return r.technicianHasDevice
          ? 'This request was cancelled. ${r.technicianName ?? 'The technician'} still has your device and has been asked to return it.'
          : 'This request was cancelled. Your device is listed again.';
    default:
      return '';
  }
}

/// One request: where it stands, the quote to decide on, what you can do now, and the history.
class RequestDetailsScreen extends ConsumerWidget {
  const RequestDetailsScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final request = ref.watch(requestProvider(id));
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Repair request'),
      body: AppBackground(
        child: SafeArea(
          child: request.when(
            skipLoadingOnReload: true,
            loading: () => ListView(
              padding: const EdgeInsets.all(20),
              children: const [Skeleton(height: 110, radius: 24), SizedBox(height: 16), Skeleton(height: 160, radius: 24)],
            ),
            error: (e, _) => ListView(
              padding: const EdgeInsets.all(20),
              children: [
                ErrorState(
                  error: e is ApiException ? e : ApiException.from(e),
                  title: e is ApiException && e.statusCode == 404 ? 'This request is not available' : null,
                  onRetry: () => ref.invalidate(requestProvider(id)),
                ),
              ],
            ),
            data: (r) => RefreshIndicator(onRefresh: () => ref.read(requestProvider(id).notifier).refresh(), child: _Body(request: r)),
          ),
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.request});

  final ServiceRequest request;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _busy = false;
  String? _error;

  ServiceRequest get r => widget.request;

  /// Runs one action with a spinner, shows what the server said if it refuses, and refreshes the device lists (their status may have changed).
  Future<void> _act(Future<ServiceRequest> Function(RequestRepository repo) action, {String? done}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(requestProvider(r.id).notifier).run((repo) => action(repo));
      if (r.listingId != null) ref.invalidate(listingProvider(r.listingId!));
      ref.invalidate(listingsProvider(true));
      ref.invalidate(listingsProvider(false));
      if (done != null && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message);
      // Someone else (usually the technician) changed it first: show what it looks like now.
      if (e.code == 'STALE_STATE' || e.statusCode == 409) await ref.read(requestProvider(r.id).notifier).refresh();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _approve(Quotation q) async {
    final ok = await askConfirm(
      context,
      title: 'Approve this quote?',
      message: 'The technician will start the repair for ${formatPrice(q.amount)}. You pay them directly. The app never handles money.',
      confirmLabel: 'Approve ${formatPrice(q.amount)}',
    );
    if (!ok) return;
    await _act((repo) => repo.decideQuotation(r.id, q.id, accept: true), done: 'Quote approved');
  }

  Future<void> _decline(Quotation q) async {
    final answer = await askReason(context, title: 'Decline this quote', confirmLabel: 'Decline', required: true, offerCancel: true, message: 'The technician will see your reason.');
    if (answer == null) return;
    await _act((repo) => repo.decideQuotation(r.id, q.id, accept: false, reason: answer.reason, cancel: answer.cancelRequest), done: answer.cancelRequest ? 'Request cancelled' : 'Quote declined');
  }

  Future<void> _pickup() async {
    final when = await pickPickupTime(context);
    if (when == null) return;
    await _act((repo) => repo.schedulePickup(r.id, date: when), done: 'Pickup saved');
  }

  Future<void> _handover() async {
    final collecting = r.status == 'device_collection_pending';
    if (r.isTechnicianView) {
      // The data-protection checklist is the owner's; the technician just confirms the device changed hands.
      final ok = await askConfirm(
        context,
        title: collecting ? 'Have you got the device?' : 'Handed it back?',
        message: collecting ? 'Confirm that ${r.customerName ?? 'the owner'} has handed the device over to you.' : 'Confirm that you have handed the device back to ${r.customerName ?? 'the owner'}.',
        confirmLabel: collecting ? 'Yes, I have it' : 'Yes, I handed it back',
      );
      if (!ok) return;
      await _act((repo) => repo.confirmHandover(r.id), done: 'Handover confirmed');
      return;
    }
    if (collecting) {
      if (!await askHandoverChecklist(context)) return;
    } else {
      final ok = await askConfirm(context, title: 'Got your device back?', message: 'Confirm that the technician has handed it back to you.', confirmLabel: 'Yes, I have it');
      if (!ok) return;
    }
    await _act((repo) => repo.confirmHandover(r.id, acknowledgeChecklist: collecting), done: 'Handover confirmed');
  }

  Future<void> _complete() async {
    final ok = await askConfirm(
      context,
      title: 'Is the repair done?',
      message: 'This closes the request and counts the repair towards your impact. You pay the technician directly.',
      confirmLabel: 'Yes, it is done',
    );
    if (!ok) return;
    await _act((repo) => repo.confirmCompletion(r.id), done: 'Service completed');
  }

  Future<void> _cancel() async {
    final answer = await askReason(
      context,
      title: 'Cancel this request?',
      confirmLabel: 'Cancel request',
      message: r.technicianHasDevice
          ? '${r.technicianName ?? 'The technician'} still has your device. They will be asked to return it, and you arrange the handover with them. Your device is then listed again.'
          : 'Your device is listed again so you can ask someone else.',
    );
    if (answer == null) return;
    await _act((repo) => repo.cancel(r.id, reason: answer.reason), done: 'Request cancelled');
  }

  /* ---------- the technician's actions ---------- */

  Future<void> _accept() => _act((repo) => repo.accept(r.id), done: 'You accepted the job');

  Future<void> _declineJob() async {
    final answer = await askReason(context, title: 'Decline this job?', confirmLabel: 'Decline job', required: true, message: 'The owner sees your reason and can ask someone else.');
    if (answer == null) return;
    await _act((repo) => repo.decline(r.id, answer.reason), done: 'Job declined');
  }

  Future<void> _startDiagnosis() => _act((repo) => repo.startDiagnosis(r.id), done: 'Diagnosis started');

  Future<void> _quote() async {
    final input = await askQuote(context, revising: r.can('revise_quotation'));
    if (input == null) return;
    await _act((repo) => repo.submitQuotation(r.id, input), done: 'Quote sent');
  }

  Future<void> _postUpdate() async {
    final input = await askUpdate(context);
    if (input == null) return;
    await _act((repo) => repo.addProgress(r.id, note: input.note, photos: input.photos), done: 'Update posted');
  }

  Future<void> _finishRepair() async {
    final input = await askUpdate(context, completing: true);
    if (input == null) return;
    await _act((repo) => repo.completeRepair(r.id, note: input.note, photos: input.photos), done: 'Repair marked as done');
  }

  Future<void> _bringBack() async {
    final when = await askReturnTime(context);
    if (when == null) return;
    await _act((repo) => repo.startDelivery(r.id, returnDate: when.date, returnSlot: when.slot), done: 'Delivery started');
  }

  Future<void> _review() async {
    final input = await askReview(context, technicianName: r.technicianName);
    if (input == null) return;
    await _act((repo) => repo.review(r.id, input), done: 'Thank you for your review');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final status = requestStatusLabel(r.status, technician: r.isTechnicianView);
    final q = r.quotation;
    final asTechnician = r.isTechnicianView;
    // The technician always sees their own quote (and what became of it); the owner sees it once there is something to decide or it is approved.
    final showQuote = q != null && (asTechnician || r.can('approve_quotation') || q.status == 'accepted' || r.status == 'repair_in_progress' || r.status == 'repair_completed' || r.status == 'service_completed');
    final hint = nextStepHint(r);

    final buttons = <Widget>[
      if (r.can('accept')) FilledButton.icon(onPressed: _busy ? null : _accept, icon: const Icon(Icons.check), label: const Text('Accept this job')),
      if (r.can('reject')) OutlinedButton.icon(onPressed: _busy ? null : _declineJob, icon: const Icon(Icons.close), label: const Text('Decline')),
      if (r.can('start_diagnosis')) FilledButton.icon(onPressed: _busy ? null : _startDiagnosis, icon: const Icon(Icons.search), label: const Text('Start diagnosis')),
      if (r.can('submit_quotation') || r.can('revise_quotation'))
        FilledButton.icon(onPressed: _busy ? null : _quote, icon: const Icon(Icons.request_quote_outlined), label: Text(r.can('revise_quotation') ? 'Send a revised quote' : 'Send quote')),
      if (r.can('add_progress')) OutlinedButton.icon(onPressed: _busy ? null : _postUpdate, icon: const Icon(Icons.add_comment_outlined), label: const Text('Post an update')),
      if (r.can('complete_repair')) FilledButton.icon(onPressed: _busy ? null : _finishRepair, icon: const Icon(Icons.task_alt), label: const Text('Mark repair as done')),
      if (r.can('start_delivery')) FilledButton.icon(onPressed: _busy ? null : _bringBack, icon: const Icon(Icons.local_shipping_outlined), label: const Text('Bring the device back')),
      if (r.can('approve_quotation') && q != null) FilledButton.icon(onPressed: _busy ? null : () => _approve(q), icon: const Icon(Icons.check), label: Text('Approve ${formatPrice(q.amount)}')),
      if (r.can('reject_quotation') && q != null) OutlinedButton.icon(onPressed: _busy ? null : () => _decline(q), icon: const Icon(Icons.close), label: const Text('Decline quote')),
      if (r.can('schedule_pickup')) FilledButton.icon(onPressed: _busy ? null : _pickup, icon: const Icon(Icons.event_outlined), label: Text(r.pickup == null ? 'Choose pickup time' : 'Change pickup time')),
      if (r.can('confirm_handover')) FilledButton.icon(onPressed: _busy ? null : _handover, icon: const Icon(Icons.handshake_outlined), label: const Text('Confirm handover')),
      if (r.can('confirm_completion')) FilledButton.icon(onPressed: _busy ? null : _complete, icon: const Icon(Icons.task_alt), label: const Text('Confirm repair is done')),
      if (r.can('review')) FilledButton.icon(onPressed: _busy ? null : _review, icon: const Icon(Icons.star_outline_rounded), label: Text('Review ${r.technicianName ?? 'the technician'}')),
      if (r.can('cancel')) OutlinedButton.icon(onPressed: _busy ? null : _cancel, icon: const Icon(Icons.cancel_outlined), label: const Text('Cancel request')),
    ];

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      children: [
        GlassContainer(
          padding: const EdgeInsets.all(12),
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              borderRadius: BorderRadius.circular(16),
              // The device page is the owner's listing view; a technician sees the device here instead.
              onTap: r.listingId == null || asTechnician ? null : () => context.push(Routes.listing(r.listingId!)),
              child: Row(
                children: [
                  ClipRRect(borderRadius: BorderRadius.circular(14), child: SizedBox(width: 72, height: 72, child: ListingPhotoView(photo: r.devicePhoto))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(header: true, child: Text(r.deviceTitle, style: theme.textTheme.titleLarge?.copyWith(fontSize: 17))),
                        if (r.deviceSubtitle.isNotEmpty) Text(r.deviceSubtitle, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 13)),
                        const SizedBox(height: 6),
                        StatusBadge(status, tone: requestTone(r.status)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(height: 12),
        if (hint.isNotEmpty) MessageBanner(message: hint, tone: r.status == 'customer_approval_pending' ? BannerTone.warning : BannerTone.info),
        if (_error != null) ...[const SizedBox(height: 12), MessageBanner(message: _error!, tone: BannerTone.error)],
        const SizedBox(height: 16),
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (asTechnician) ...[
                _fact(theme, 'Customer', r.customerName ?? 'Not shown'),
                if (r.deviceArea.isNotEmpty) ...[const Divider(height: 20), _fact(theme, 'Area', r.deviceArea)],
              ] else
                _fact(theme, 'Technician', r.technicianName ?? 'Not chosen yet'),
              const Divider(height: 20),
              // How the repair is done, which holds for the whole request (not where the device is right now).
              _fact(theme, 'Repair', r.onSite ? (asTechnician ? 'At the customer\'s place' : 'At your place') : (asTechnician ? 'Collect and return' : 'Collected and returned')),
              if (r.pickup?.date != null) ...[
                const Divider(height: 20),
                _fact(theme, 'Pickup', formatDateTime(r.pickup!.date) + (r.pickup!.timeSlot == null ? '' : ' · ${r.pickup!.timeSlot}')),
              ],
              if (r.returnSchedule?.date != null) ...[
                const Divider(height: 20),
                _fact(theme, 'Return', formatDateTime(r.returnSchedule!.date) + (r.returnSchedule!.timeSlot == null ? '' : ' · ${r.returnSchedule!.timeSlot}')),
              ],
              const Divider(height: 20),
              Text('The problem', style: theme.textTheme.bodyMedium),
              const SizedBox(height: 4),
              Text(r.issueDescription, style: theme.textTheme.bodyLarge),
            ],
          ),
        ),
        if (showQuote) ...[const SizedBox(height: 16), _QuoteCard(quotation: q, technician: asTechnician)],
        if (r.progressUpdates.isNotEmpty || r.repairNotes.isNotEmpty || r.progressPhotos.isNotEmpty) ...[const SizedBox(height: 16), _RepairUpdates(request: r)],
        if (r.status == 'device_collection_pending' || r.status == 'device_delivery_pending') ...[const SizedBox(height: 16), _HandoverCard(request: r)],
        if (buttons.isNotEmpty) ...[
          const SizedBox(height: 16),
          for (final b in buttons) Padding(padding: const EdgeInsets.only(bottom: 8), child: b),
          if (_busy) const Padding(padding: EdgeInsets.only(top: 4), child: LinearProgressIndicator()),
        ],
        const SizedBox(height: 16),
        _Timeline(steps: r.history, technician: asTechnician),
      ],
    );
  }

  Widget _fact(ThemeData theme, String label, String value) => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 100, child: Text(label, style: theme.textTheme.bodyMedium)),
          Expanded(child: Text(value, style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600))),
        ],
      );
}

class _QuoteCard extends StatelessWidget {
  const _QuoteCard({required this.quotation, this.technician = false});

  final Quotation quotation;

  /// The technician's own view of the quote: "Your quote", and the owner pays them.
  final bool technician;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final q = quotation;
    final decided = q.status == 'accepted';
    final title = decided ? 'Approved quote' : (technician ? (q.status == 'rejected' ? 'Quote declined' : 'Your quote') : 'Quote to review');
    return GlassContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Semantics(header: true, child: Text(title, style: theme.textTheme.titleLarge))),
              if (q.version > 1) StatusBadge('Revised (v${q.version})', tone: BadgeTone.amber),
            ],
          ),
          const SizedBox(height: 6),
          Text(formatPrice(q.amount), style: theme.textTheme.headlineMedium?.copyWith(color: theme.colorScheme.primary)),
          if (q.breakdown.isNotEmpty) ...[
            const SizedBox(height: 8),
            for (final line in q.breakdown)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(children: [Expanded(child: Text(line.label)), Text(formatPrice(line.amount))]),
              ),
          ],
          if (q.parts.isNotEmpty) ...[const SizedBox(height: 8), Text('Parts: ${q.parts.join(', ')}', style: theme.textTheme.bodyMedium)],
          if (q.etaDays != null) Text('Takes about ${q.etaDays} ${q.etaDays == 1 ? 'day' : 'days'}', style: theme.textTheme.bodyMedium),
          if (q.validUntil != null && !decided) Text('Valid until ${formatDate(q.validUntil)}', style: theme.textTheme.bodyMedium),
          if (q.notes != null && q.notes!.trim().isNotEmpty) ...[const SizedBox(height: 8), Text(q.notes!, style: theme.textTheme.bodyLarge)],
          const SizedBox(height: 8),
          Text(technician ? 'The owner pays you directly.' : 'You pay the technician directly.', style: theme.textTheme.bodyMedium),
        ],
      ),
    );
  }
}

class _HandoverCard extends StatelessWidget {
  const _HandoverCard({required this.request});

  final ServiceRequest request;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final collecting = request.status == 'device_collection_pending';
    final h = request.handover;
    final owner = collecting ? h.collectOwner : h.deliveryOwner;
    final provider = collecting ? h.collectProvider : h.deliveryProvider;
    final asTechnician = request.isTechnicianView;
    Widget line(String who, bool done) => Row(
          children: [
            Icon(done ? Icons.check_circle : Icons.radio_button_unchecked, size: 20, color: done ? theme.colorScheme.primary : theme.disabledColor),
            const SizedBox(width: 8),
            Text('$who ${done ? 'confirmed' : '${who == 'You' ? 'have' : 'has'} not confirmed yet'}'),
          ],
        );
    return GlassContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(
            header: true,
            child: Text(
              asTechnician ? (collecting ? 'Collecting the device' : 'Handing the device back') : (collecting ? 'Handing over your device' : 'Getting your device back'),
              style: theme.textTheme.titleLarge,
            ),
          ),
          const SizedBox(height: 8),
          // Each person sees themselves as "You" and the other side by name.
          line('You', asTechnician ? provider : owner),
          const SizedBox(height: 4),
          line(asTechnician ? (request.customerName ?? 'The owner') : (request.technicianName ?? 'The technician'), asTechnician ? owner : provider),
        ],
      ),
    );
  }
}

/// What the technician has posted while checking or repairing, newest first: each update with its own photos, or for
/// older requests the notes followed by all the photos.
class _RepairUpdates extends StatelessWidget {
  const _RepairUpdates({required this.request});

  final ServiceRequest request;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final grouped = request.progressUpdates.reversed.toList();
    if (grouped.isNotEmpty) {
      return GlassContainer(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(header: true, child: Text('Repair updates', style: theme.textTheme.titleLarge)),
            for (final u in grouped)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (u.text.isNotEmpty) Text(u.text, style: theme.textTheme.bodyLarge),
                    if (u.at != null) Text(formatDateTime(u.at), style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12)),
                    if (u.photos.isNotEmpty) ...[
                      const SizedBox(height: 8),
                      Semantics(
                        label: '${u.photos.length} ${u.photos.length == 1 ? 'photo' : 'photos'} with this update',
                        child: _StepPhotos(photos: u.photos),
                      ),
                    ],
                  ],
                ),
              ),
          ],
        ),
      );
    }
    final notes = request.repairNotes.reversed.toList();
    final photos = request.progressPhotos;
    return GlassContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(header: true, child: Text('Repair updates', style: theme.textTheme.titleLarge)),
          for (final n in notes)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(n.text, style: theme.textTheme.bodyLarge),
                  if (n.at != null) Text(formatDateTime(n.at), style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12)),
                ],
              ),
            ),
          if (photos.isNotEmpty) ...[
            const SizedBox(height: 12),
            Semantics(
              label: '${photos.length} ${photos.length == 1 ? 'photo' : 'photos'} from the technician',
              child: _StepPhotos(photos: photos),
            ),
          ],
        ],
      ),
    );
  }
}

/// Small photos under a history step or an update; tapping one opens it larger, with pinch to zoom.
class _StepPhotos extends StatelessWidget {
  const _StepPhotos({required this.photos});

  final List<ListingPhoto> photos;

  void _open(BuildContext context, ListingPhoto photo) {
    showDialog<void>(
      context: context,
      builder: (context) => Dialog(
        clipBehavior: Clip.antiAlias,
        insetPadding: const EdgeInsets.all(16),
        child: Stack(
          children: [
            InteractiveViewer(maxScale: 4, child: AspectRatio(aspectRatio: 3 / 4, child: ListingPhotoView(photo: photo, fit: BoxFit.contain, semanticLabel: 'Repair photo'))),
            Positioned(
              top: 4,
              right: 4,
              child: IconButton.filledTonal(tooltip: 'Close', icon: const Icon(Icons.close), onPressed: () => Navigator.of(context).pop()),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final p in photos)
          InkWell(
            borderRadius: BorderRadius.circular(12),
            onTap: () => _open(context, p),
            child: ClipRRect(borderRadius: BorderRadius.circular(12), child: SizedBox(width: 72, height: 72, child: ListingPhotoView(photo: p, semanticLabel: 'Repair photo'))),
          ),
      ],
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.steps, this.technician = false});

  final List<RequestStep> steps;

  /// Word the steps for the technician ("Waiting for approval") instead of the owner ("Your approval needed").
  final bool technician;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    if (steps.isEmpty) return const SizedBox.shrink();
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
                '${requestStatusLabel(latestFirst[i].status, technician: technician)}. ${formatDateTime(latestFirst[i].at)}.',
                if (latestFirst[i].note != null && latestFirst[i].note!.trim().isNotEmpty) '${latestFirst[i].note!.trim()}.',
                if (latestFirst[i].photos.isNotEmpty) '${latestFirst[i].photos.length} ${latestFirst[i].photos.length == 1 ? 'photo' : 'photos'}.',
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
                          Text(requestStatusLabel(latestFirst[i].status, technician: technician), style: theme.textTheme.bodyLarge?.copyWith(fontWeight: i == 0 ? FontWeight.w700 : FontWeight.w500)),
                          Text(formatDateTime(latestFirst[i].at), style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12)),
                          if (latestFirst[i].note != null && latestFirst[i].note!.trim().isNotEmpty) Text(latestFirst[i].note!, style: theme.textTheme.bodyMedium),
                          if (latestFirst[i].photos.isNotEmpty) ...[
                            const SizedBox(height: 8),
                            _StepPhotos(photos: latestFirst[i].photos),
                          ],
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
