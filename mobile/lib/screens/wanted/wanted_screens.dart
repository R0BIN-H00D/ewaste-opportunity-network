import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/user.dart';
import '../../models/wanted.dart';
import '../../providers/auth_controller.dart';
import '../../providers/wanted_providers.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/message_button.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';

String _summary(WantedRequest w) => [
      w.categoryName,
      w.brand,
      if (w.minCondition != null) '${labelOf(conditions, w.minCondition)} or better',
      'Qty ${w.quantity}',
    ].where((v) => (v ?? '').isNotEmpty).join(' · ');

/// Wanted devices. A refurbisher sees and manages their own requests; owners and technicians see what refurbishers are
/// looking for and can accept the ones they can help with.
class WantedPage extends ConsumerWidget {
  const WantedPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final role = ref.watch(authControllerProvider.select((s) => s.user?.role));
    final refurbisher = role == UserRole.refurbisher;
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, refurbisher ? 'My requests' : 'Wanted devices'),
      floatingActionButton: refurbisher
          ? FloatingActionButton.extended(
              onPressed: () => _addRequest(context, ref),
              icon: const Icon(Icons.add),
              label: const Text('New request'),
            )
          : null,
      body: AppBackground(child: SafeArea(child: refurbisher ? const _MyRequests() : const _Board())),
    );
  }
}

Future<void> _addRequest(BuildContext context, WidgetRef ref) async {
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => const _NewRequestSheet(),
  );
  if (saved == true) ref.invalidate(wantedMineProvider);
}

/// What owners and technicians see: open requests with an Accept button.
class _Board extends ConsumerWidget {
  const _Board();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final board = ref.watch(wantedBoardProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.refresh(wantedBoardProvider.future),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 110),
        children: [
          Text('Refurbishers post the devices they are looking for. If you can help, accept the request and they will get in touch.', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 16),
          board.when(
            loading: () => const Skeleton(height: 120, radius: 24),
            error: (e, _) => ErrorState(error: e is ApiException ? e : ApiException.from(e), onRetry: () => ref.invalidate(wantedBoardProvider)),
            data: (items) => items.isEmpty
                ? const EmptyState(icon: Icons.manage_search_outlined, title: 'No requests right now', message: 'When a refurbisher posts a device they are looking for it appears here.')
                : Column(children: [for (final w in items) Padding(padding: const EdgeInsets.only(bottom: 12), child: _BoardCard(request: w))]),
          ),
        ],
      ),
    );
  }
}

/// Asks for an optional message before accepting. It owns its text field, so it is cleaned up only after it has closed.
class _AcceptDialog extends StatefulWidget {
  const _AcceptDialog({required this.request});

  final WantedRequest request;

  @override
  State<_AcceptDialog> createState() => _AcceptDialogState();
}

class _AcceptDialogState extends State<_AcceptDialog> {
  final _message = TextEditingController();

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('Accept this request'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${widget.request.refurbisherName ?? 'The refurbisher'} is looking for: ${widget.request.title}. They will be told you can help and can message you.'),
            const SizedBox(height: 12),
            TextField(controller: _message, maxLines: 3, maxLength: 1000, decoration: const InputDecoration(labelText: 'Message (optional)', helperText: 'For example what device you have')),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.pop(context, _message.text), child: const Text('Accept')),
        ],
      );
}

class _BoardCard extends ConsumerStatefulWidget {
  const _BoardCard({required this.request});

  final WantedRequest request;

  @override
  ConsumerState<_BoardCard> createState() => _BoardCardState();
}

class _BoardCardState extends ConsumerState<_BoardCard> {
  bool _busy = false;

  Future<void> _accept() async {
    final message = await showDialog<String>(
      context: context,
      builder: (_) => _AcceptDialog(request: widget.request),
    );
    if (message == null || !mounted) return;
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(wantedRepositoryProvider).respond(widget.request.id, message: message);
      ref.invalidate(wantedBoardProvider);
      messenger.showSnackBar(const SnackBar(content: Text('Accepted. The refurbisher has been told.')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final w = widget.request;
    return GlassContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(w.title, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16)),
          const SizedBox(height: 4),
          Text(_summary(w), style: theme.textTheme.bodyMedium),
          if ((w.city ?? '').isNotEmpty) Text(w.city!, style: theme.textTheme.bodyMedium),
          if ((w.notes ?? '').isNotEmpty) ...[const SizedBox(height: 6), Text(w.notes!)],
          const SizedBox(height: 6),
          Text('Wanted by ${w.refurbisherName ?? 'a refurbisher'}', style: theme.textTheme.labelSmall),
          const SizedBox(height: 12),
          if (w.hasResponded)
            const Row(children: [Icon(Icons.check_circle_outline, size: 18), SizedBox(width: 6), Text('Accepted')])
          else
            FilledButton(onPressed: _busy ? null : _accept, child: Text(_busy ? 'Sending…' : 'Accept')),
        ],
      ),
    );
  }
}

/// A refurbisher's own requests, with who accepted each.
class _MyRequests extends ConsumerWidget {
  const _MyRequests();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mine = ref.watch(wantedMineProvider);
    return RefreshIndicator(
      onRefresh: () async => ref.refresh(wantedMineProvider.future),
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 110),
        children: [
          Text('Tell owners what you are looking for. Open requests are visible to them and they can accept the ones they can help with.', style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 16),
          mine.when(
            loading: () => const Skeleton(height: 120, radius: 24),
            error: (e, _) => ErrorState(error: e is ApiException ? e : ApiException.from(e), onRetry: () => ref.invalidate(wantedMineProvider)),
            data: (items) => items.isEmpty
                ? EmptyState(
                    icon: Icons.manage_search_outlined,
                    title: 'No requests yet',
                    message: 'Add one to tell owners what you are looking for.',
                    actionLabel: 'New request',
                    onAction: () => _addRequest(context, ref))
                : Column(children: [for (final w in items) Padding(padding: const EdgeInsets.only(bottom: 12), child: _MineCard(request: w))]),
          ),
        ],
      ),
    );
  }
}

class _MineCard extends ConsumerStatefulWidget {
  const _MineCard({required this.request});

  final WantedRequest request;

  @override
  ConsumerState<_MineCard> createState() => _MineCardState();
}

class _MineCardState extends ConsumerState<_MineCard> {
  bool _showWho = false;
  bool _busy = false;

  Future<void> _do(Future<void> Function() action) async {
    setState(() => _busy = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await action();
      ref.invalidate(wantedMineProvider);
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final w = widget.request;
    final repo = ref.read(wantedRepositoryProvider);
    return GlassContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(child: Text(w.title, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16))),
              Text(w.isOpen ? 'Open' : 'Closed', style: theme.textTheme.labelSmall),
            ],
          ),
          const SizedBox(height: 4),
          Text(_summary(w), style: theme.textTheme.bodyMedium),
          if ((w.city ?? '').isNotEmpty) Text(w.city!, style: theme.textTheme.bodyMedium),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              if (w.responseCount > 0) AppChip(label: '${w.responseCount} accepted', selected: _showWho, onTap: () => setState(() => _showWho = !_showWho)),
              AppChip(label: w.isOpen ? 'Close' : 'Reopen', selected: false, onTap: _busy ? () {} : () => _do(() => repo.setStatus(w.id, w.isOpen ? 'closed' : 'open'))),
              AppChip(label: 'Delete', selected: false, onTap: _busy ? () {} : () => _do(() => repo.delete(w.id))),
            ],
          ),
          if (_showWho) _Responders(id: w.id),
        ],
      ),
    );
  }
}

class _Responders extends ConsumerWidget {
  const _Responders({required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final who = ref.watch(wantedResponsesProvider(id));
    return who.when(
      loading: () => const Padding(padding: EdgeInsets.only(top: 12), child: LinearProgressIndicator()),
      error: (e, _) => const Padding(padding: EdgeInsets.only(top: 12), child: MessageBanner(message: 'Could not load who accepted.', tone: BannerTone.error)),
      data: (items) => Column(
        children: [
          for (final r in items)
            Padding(
              padding: const EdgeInsets.only(top: 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${r.name} (${r.role == 'technician' ? 'technician' : 'device owner'})', style: Theme.of(context).textTheme.titleSmall),
                  if ((r.message ?? '').isNotEmpty) Text(r.message!),
                  const SizedBox(height: 6),
                  MessageButton(contextType: 'wanted', contextId: r.id),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

class _NewRequestSheet extends ConsumerStatefulWidget {
  const _NewRequestSheet();

  @override
  ConsumerState<_NewRequestSheet> createState() => _NewRequestSheetState();
}

class _NewRequestSheetState extends ConsumerState<_NewRequestSheet> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _brand = TextEditingController();
  final _quantity = TextEditingController(text: '1');
  final _city = TextEditingController();
  final _notes = TextEditingController();
  String _condition = '';
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [_title, _brand, _quantity, _city, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await ref.read(wantedRepositoryProvider).create(
            title: _title.text,
            brand: _brand.text,
            minCondition: _condition,
            quantity: int.tryParse(_quantity.text.trim()) ?? 1,
            city: _city.text,
            notes: _notes.text,
          );
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Form(
        key: _form,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('New request', style: theme.textTheme.titleLarge),
              const SizedBox(height: 4),
              Text('Tell device owners what you are looking for. Open requests are visible to them.', style: theme.textTheme.bodyMedium),
              const SizedBox(height: 12),
              if (_error != null) ...[MessageBanner(message: _error!, tone: BannerTone.error), const SizedBox(height: 12)],
              TextFormField(
                controller: _title,
                maxLength: 120,
                decoration: const InputDecoration(labelText: 'What are you looking for?', hintText: 'Used laptops, any brand'),
                validator: (v) => (v ?? '').trim().length < 3 ? 'Say what you are looking for (at least 3 letters)' : null,
              ),
              TextFormField(controller: _brand, maxLength: 60, decoration: const InputDecoration(labelText: 'Brand (optional)')),
              const SizedBox(height: 4),
              Text('Worst condition you accept (optional)', style: theme.textTheme.titleSmall),
              const SizedBox(height: 8),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final (value, label) in conditions) AppChip(label: label, selected: _condition == value, onTap: () => setState(() => _condition = _condition == value ? '' : value)),
              ]),
              const SizedBox(height: 12),
              TextFormField(
                controller: _quantity,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'How many?'),
                validator: (v) {
                  final n = int.tryParse((v ?? '').trim());
                  return n == null || n < 1 || n > 1000 ? 'Enter a number from 1 to 1000' : null;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(controller: _city, maxLength: 80, decoration: const InputDecoration(labelText: 'City (optional)')),
              TextFormField(controller: _notes, maxLines: 3, maxLength: 1000, decoration: const InputDecoration(labelText: 'Notes (optional)')),
              const SizedBox(height: 8),
              FilledButton(onPressed: _saving ? null : _save, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), child: Text(_saving ? 'Saving…' : 'Add request')),
            ],
          ),
        ),
      ),
    );
  }
}
