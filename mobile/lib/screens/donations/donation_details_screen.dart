import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../pickups/slot_sheet.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/donation.dart';
import '../../providers/donation_providers.dart';
import '../../providers/listings_controller.dart';
import '../../routes/route_paths.dart';
import '../../services/donation_repository.dart';
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
import 'donation_card.dart';
import 'donation_dialogs.dart';

/// One plain sentence on where the donation stands and what happens next, for whoever is looking.
String donationHint(Donation d) {
  final other = d.otherSideName;
  if (d.isDonorView) {
    switch (d.status) {
      case 'open':
        return 'Your device is listed. Verified organisations can ask for it. You can cancel any time before it is handed over.';
      case 'requested':
        return 'Choose who should receive it. The other requests are declined when you do.';
      case 'accepted':
        return '${other ?? 'The recipient'} was chosen. Arrange a time to hand the device over.';
      case 'handover_scheduled':
        return d.donorConfirmed ? 'You confirmed the handover. Waiting for ${other ?? 'the recipient'} to confirm too.' : 'Hand the device over at the arranged time, then confirm here. Back it up and reset it first.';
      case 'completed':
        return 'Done. Thank you for giving a device a second life. It counts towards your impact.';
      default:
        return 'This donation was cancelled.';
    }
  }
  if (d.isRecipientView) {
    switch (d.status) {
      case 'accepted':
        return '${other ?? 'The donor'} chose you. Arrange a time to collect the device.';
      case 'handover_scheduled':
        return d.recipientConfirmed ? 'You confirmed the handover. Waiting for ${other ?? 'the donor'} to confirm too.' : 'Collect the device at the arranged time, then confirm here.';
      case 'completed':
        return 'Done. The record below shows the device was given free.';
      default:
        return 'This donation was cancelled.';
    }
  }
  final mine = d.myRequest;
  if (mine != null) {
    switch (mine.status) {
      case 'pending':
        return 'You asked for this device. The donor will choose between the requests.';
      case 'rejected':
        return 'The donor chose someone else, or the donation ended.';
      case 'withdrawn':
        return 'You withdrew your request.';
      default:
        return 'The donor chose you.';
    }
  }
  switch (d.status) {
    case 'open':
    case 'requested':
      return 'Free to a verified organisation. Nobody pays: the app never handles money.';
    case 'cancelled':
      return 'This donation was cancelled.';
    default:
      return 'This donation is no longer open.';
  }
}

class DonationDetailsScreen extends ConsumerWidget {
  const DonationDetailsScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final donation = ref.watch(donationProvider(id));
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Donation'),
      body: AppBackground(
        child: SafeArea(
          child: donation.when(
            skipLoadingOnReload: true,
            loading: () => ListView(padding: const EdgeInsets.all(20), children: const [Skeleton(height: 200, radius: 24), SizedBox(height: 16), Skeleton(height: 140, radius: 24)]),
            error: (e, _) => ListView(
              padding: const EdgeInsets.all(20),
              children: [
                ErrorState(
                  error: ApiException.from(e),
                  title: ApiException.from(e).failure == ApiFailure.notFound ? 'This donation is not available' : null,
                  onRetry: () => ref.invalidate(donationProvider(id)),
                ),
              ],
            ),
            data: (d) => RefreshIndicator(onRefresh: () => ref.read(donationProvider(id).notifier).refresh(), child: _Body(donation: d)),
          ),
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.donation});

  final Donation donation;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _busy = false;
  String? _error;

  Donation get d => widget.donation;

  /// Runs one action with a disabled button, shows what the server said if it refuses, and refreshes what the action may have changed.
  Future<void> _act(Future<Donation> Function(DonationRepository repo) action, {String? done}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(donationProvider(d.id).notifier).run((repo) => action(repo));
      // Offering or cancelling locks or frees the listing, so the device lists may be out of date.
      ref.invalidate(listingsProvider(true));
      ref.invalidate(listingsProvider(false));
      if (done != null && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message);
      // The other side changed it first: show what it looks like now.
      if (e.code == 'STALE_STATE' || e.failure == ApiFailure.conflict) await ref.read(donationProvider(d.id).notifier).refresh();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _request() async {
    final ask = await askDonation(context, title: d.device.title);
    if (ask == null) return;
    await _act((repo) => repo.request(d.id, justification: ask.justification, intendedUse: ask.intendedUse), done: 'Request sent. The donor has been told.');
  }

  Future<void> _withdraw() async {
    final ok = await askConfirm(context, title: 'Withdraw your request?', message: 'The donor will no longer see it. You can ask again later.', confirmLabel: 'Withdraw');
    if (!ok) return;
    await _act((repo) => repo.withdraw(d.id), done: 'Request withdrawn');
  }

  Future<void> _decide(DonationRequestRow row, {required bool accept}) async {
    final ok = await askConfirm(
      context,
      title: accept ? 'Choose ${row.title}?' : 'Decline ${row.title}?',
      message: accept ? 'They receive the device. All the other requests are declined.' : 'They are told that you chose not to give them this device.',
      confirmLabel: accept ? 'Choose' : 'Decline',
    );
    if (!ok) return;
    await _act((repo) => repo.decide(d.id, row.id, accept: accept), done: accept ? 'Recipient chosen' : 'Request declined');
  }

  Future<void> _schedule() async {
    final when = await pickPickupSlot(context);
    if (when == null) return;
    await _act((repo) => repo.scheduleHandover(d.id, date: when.date, timeSlot: when.slot), done: 'Handover saved');
  }

  Future<void> _handover() async {
    if (d.isRecipientView) {
      final ok = await askConfirm(context, title: 'Did you collect it?', message: 'Confirm that you have received the device from ${d.donorName ?? 'the donor'}.', confirmLabel: 'Yes, I have it');
      if (!ok) return;
      await _act((repo) => repo.confirmHandover(d.id), done: 'Handover confirmed');
      return;
    }
    if (!await askHandoverChecklist(context)) return;
    await _act((repo) => repo.confirmHandover(d.id, acknowledgeChecklist: true), done: 'Handover confirmed');
  }

  Future<void> _cancel() async {
    final answer = await askReason(
      context,
      title: 'Cancel this donation?',
      confirmLabel: 'Cancel donation',
      message: 'Anyone who asked for it is told. Your device is listed again.',
    );
    if (answer == null) return;
    await _act((repo) => repo.cancel(d.id, reason: answer.reason), done: 'Donation cancelled');
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

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    Widget button(String label, IconData icon, VoidCallback onTap, {bool primary = false}) => Padding(
          padding: const EdgeInsets.only(top: 8),
          child: primary
              ? FilledButton.icon(onPressed: _busy ? null : onTap, icon: Icon(icon), label: Text(label), style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)))
              : OutlinedButton.icon(onPressed: _busy ? null : onTap, icon: Icon(icon), label: Text(label), style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48))),
        );

    final canAskButNotVerified = d.viewerRole == 'visitor' && ['open', 'requested'].contains(d.status) && !d.can('request') && d.myRequest == null;
    final buttons = <Widget>[
      if (d.can('request')) button('Ask for this device', Icons.volunteer_activism_outlined, _request, primary: true),
      if (d.can('withdraw')) button('Withdraw my request', Icons.undo_outlined, _withdraw),
      if (d.can('schedule_handover')) button(d.handover?.date == null ? 'Arrange the handover' : 'Change the handover', Icons.event_available_outlined, _schedule, primary: d.handover?.date == null),
      if (d.can('confirm_handover')) button('Confirm the handover', Icons.handshake_outlined, _handover, primary: true),
      if (d.can('cancel')) button('Cancel donation', Icons.cancel_outlined, _cancel),
    ];
    final handover = d.handover;
    final asked = d.myRequest;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      children: [
        SizedBox(
          height: 200,
          child: d.device.photos.isEmpty
              ? ClipRRect(borderRadius: BorderRadius.circular(24), child: const ListingPhotoView(photo: null))
              : ListView.separated(
                  scrollDirection: Axis.horizontal,
                  itemCount: d.device.photos.length,
                  separatorBuilder: (_, __) => const SizedBox(width: 8),
                  itemBuilder: (_, i) => ClipRRect(
                    borderRadius: BorderRadius.circular(24),
                    child: SizedBox(width: d.device.photos.length == 1 ? MediaQuery.sizeOf(context).width - 40 : 260, child: ListingPhotoView(photo: d.device.photos[i], semanticLabel: 'Photo ${i + 1} of ${d.device.photos.length}')),
                  ),
                ),
        ),
        const SizedBox(height: 16),
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(header: true, child: Text(d.device.title, style: theme.textTheme.headlineSmall)),
              if (d.device.subtitle.isNotEmpty) Text(d.device.subtitle, style: theme.textTheme.bodyMedium),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  StatusBadge(labelOf(conditions, d.device.condition), tone: conditionTone(d.device.condition)),
                  StatusBadge(donationStatusText(d), tone: donationTone(d)),
                ],
              ),
              const SizedBox(height: 12),
              Text(donationHint(d), style: theme.textTheme.bodyLarge),
              if (_error != null) ...[const SizedBox(height: 12), MessageBanner(message: _error!, tone: BannerTone.error)],
              if (d.status == 'cancelled' && (d.cancelReason ?? '').trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                MessageBanner(message: 'Reason: ${d.cancelReason!.trim()}', tone: BannerTone.warning),
              ],
              if (canAskButNotVerified) ...[
                const SizedBox(height: 12),
                const MessageBanner(message: 'Only verified organisations such as schools, colleges and NGOs can ask for a device.'),
                Padding(padding: const EdgeInsets.only(top: 4), child: TextButton(onPressed: () => context.push(Routes.recipient), child: const Text('Register your organisation'))),
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
              Semantics(header: true, child: Text('The device', style: theme.textTheme.titleLarge)),
              if ((d.donorName ?? '').isNotEmpty) _fact(theme, 'Offered by', d.donorName!),
              if (d.device.place.isNotEmpty) _fact(theme, 'Area', d.device.place),
              if ((d.description ?? '').trim().isNotEmpty) _fact(theme, 'Donor\'s note', d.description!.trim()),
              if ((d.device.description ?? '').trim().isNotEmpty) _fact(theme, 'About it', d.device.description!.trim()),
              if (d.isDonorView || d.isRecipientView) ...[
                const SizedBox(height: 8),
                Text(d.isFinished ? 'The exact address was only shared between you and the other side.' : 'The exact address is shared between you and the other side only.', style: theme.textTheme.bodyMedium),
              ],
            ],
          ),
        ),
        if (asked != null) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text('Your request', style: theme.textTheme.titleLarge)),
                _fact(theme, 'Status', labelOf(donationRequestStatusPairs, asked.status)),
                if ((asked.justification ?? '').trim().isNotEmpty) _fact(theme, 'Why', asked.justification!.trim()),
                if ((asked.intendedUse ?? '').trim().isNotEmpty) _fact(theme, 'Use', asked.intendedUse!.trim()),
                if (asked.id.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 12), child: MessageButton(contextType: 'donation', contextId: asked.id, label: 'Message ${d.donorName ?? 'the donor'}')),
              ],
            ),
          ),
        ],
        if (d.isDonorView && d.requests.isNotEmpty) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text('Requests', style: theme.textTheme.titleLarge)),
                for (final row in d.requests) ...[
                  _RequestRow(row: row, canDecide: d.can('decide') && row.isPending, busy: _busy, onChoose: () => _decide(row, accept: true), onDecline: () => _decide(row, accept: false)),
                  if (row.id.isNotEmpty) Padding(padding: const EdgeInsets.only(bottom: 8), child: MessageButton(contextType: 'donation', contextId: row.id, label: 'Message ${row.title}')),
                ],
              ],
            ),
          ),
        ],
        if ((d.isDonorView || d.isRecipientView) && (d.recipientName != null || handover?.date != null)) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text('Handover', style: theme.textTheme.titleLarge)),
                if (d.otherSideName != null) _fact(theme, d.isDonorView ? 'Recipient' : 'Donor', d.otherSideName!),
                if (handover?.date != null) _fact(theme, 'When', formatDateTime(handover!.date)),
                if ((handover?.timeSlot ?? '').trim().isNotEmpty) _fact(theme, 'Time slot', handover!.timeSlot!.trim()),
                if ((handover?.notes ?? '').trim().isNotEmpty) _fact(theme, 'Notes', handover!.notes!.trim()),
                if (d.status == 'handover_scheduled') ...[
                  const SizedBox(height: 8),
                  _check(theme, 'You confirmed the handover', d.isDonorView ? d.donorConfirmed : d.recipientConfirmed),
                  _check(theme, d.isDonorView ? 'The recipient confirmed' : 'The donor confirmed', d.isDonorView ? d.recipientConfirmed : d.donorConfirmed),
                ],
              ],
            ),
          ),
        ],
        if (d.can('view_confirmation')) ...[const SizedBox(height: 16), _ConfirmationCard(id: d.id)],
        if (d.history.isNotEmpty) ...[const SizedBox(height: 16), _Timeline(steps: d.history)],
      ],
    );
  }
}

/// Request statuses as pairs, so [labelOf] can word them.
final LabelPairs donationRequestStatusPairs = [for (final e in donationRequestStatusLabels.entries) (e.key, e.value)];

class _RequestRow extends StatelessWidget {
  const _RequestRow({required this.row, required this.canDecide, required this.busy, required this.onChoose, required this.onDecline});

  final DonationRequestRow row;
  final bool canDecide;
  final bool busy;
  final VoidCallback onChoose;
  final VoidCallback onDecline;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final type = row.orgType == null ? null : labelOf(orgTypes, row.orgType);
    return Padding(
      padding: const EdgeInsets.only(top: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(row.title, style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700))),
              if (!row.isPending) StatusBadge(labelOf(donationRequestStatusPairs, row.status), tone: row.status == 'accepted' ? BadgeTone.green : BadgeTone.neutral),
            ],
          ),
          if (type != null) Text(type, style: theme.textTheme.bodyMedium),
          if ((row.justification ?? '').trim().isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(row.justification!.trim(), style: theme.textTheme.bodyLarge)),
          if ((row.intendedUse ?? '').trim().isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Use: ${row.intendedUse!.trim()}', style: theme.textTheme.bodyMedium)),
          if (canDecide)
            Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Row(
                children: [
                  Expanded(child: FilledButton(onPressed: busy ? null : onChoose, child: const Text('Choose this one'))),
                  const SizedBox(width: 8),
                  Expanded(child: OutlinedButton(onPressed: busy ? null : onDecline, child: const Text('Decline'))),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _ConfirmationCard extends ConsumerWidget {
  const _ConfirmationCard({required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final confirmation = ref.watch(donationConfirmationProvider(id));
    return GlassContainer(
      child: confirmation.when(
        loading: () => const Skeleton(height: 90, radius: 16),
        error: (e, _) => ErrorState(error: ApiException.from(e), onRetry: () => ref.invalidate(donationConfirmationProvider(id))),
        data: (c) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Semantics(header: true, child: Text('Confirmation', style: theme.textTheme.titleLarge)),
            const SizedBox(height: 6),
            Text(c.refNo, style: theme.textTheme.titleMedium),
            if (c.issuedAt != null) Text('Issued ${formatDate(c.issuedAt)}', style: theme.textTheme.bodyMedium),
            const SizedBox(height: 8),
            Text('${c.deviceTitle}: from ${c.donorName} to ${c.recipientOrg ?? c.recipientName}', style: theme.textTheme.bodyLarge),
            if (c.handoverDate != null) Text('Handed over ${formatDateTime(c.handoverDate)}', style: theme.textTheme.bodyMedium),
            if ((c.statement ?? '').trim().isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text(c.statement!.trim(), style: theme.textTheme.bodyMedium)),
          ],
        ),
      ),
    );
  }
}

class _Timeline extends StatelessWidget {
  const _Timeline({required this.steps});

  final List<DonationStep> steps;

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
                '${donationStatusLabel(latestFirst[i].status)}. ${formatDateTime(latestFirst[i].at)}.',
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
                          Text(donationStatusLabel(latestFirst[i].status), style: theme.textTheme.bodyLarge?.copyWith(fontWeight: i == 0 ? FontWeight.w700 : FontWeight.w500)),
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
