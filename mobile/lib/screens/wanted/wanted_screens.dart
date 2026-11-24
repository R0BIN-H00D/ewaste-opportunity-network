import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_colors.dart';
import '../../models/user.dart';
import '../../models/wanted.dart';
import '../../providers/auth_controller.dart';
import '../../providers/wanted_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/detect_location_button.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/message_button.dart';
import '../../widgets/page_banner.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';

/// What was asked for, as small labelled pills: the kind of device, brand, worst condition, how many and where.
List<(IconData, String)> _facts(WantedRequest w) => [
      if ((w.categoryName ?? '').isNotEmpty) (Icons.category_outlined, w.categoryName!),
      if ((w.brand ?? '').isNotEmpty) (Icons.sell_outlined, w.brand!),
      if (w.minCondition != null) (Icons.verified_outlined, '${labelOf(conditions, w.minCondition)} or better'),
      (Icons.numbers_rounded, 'Qty ${w.quantity}'),
      if ((w.city ?? '').isNotEmpty) (Icons.place_outlined, w.city!),
    ];

class _FactPills extends StatelessWidget {
  const _FactPills(this.request);

  final WantedRequest request;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final (icon, text) in _facts(request))
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(color: theme.colorScheme.onSurface.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(20)),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(icon, size: 14, color: theme.colorScheme.primary),
                const SizedBox(width: 5),
                Flexible(child: Text(text, style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onSurface))),
              ],
            ),
          ),
      ],
    );
  }
}

/// The coloured square with the device icon at the left of a card.
class _DeviceTile extends StatelessWidget {
  const _DeviceTile({required this.accent});

  final Color accent;

  @override
  Widget build(BuildContext context) {
    final tone = AppColors.adapt(context, accent);
    return ExcludeSemantics(
      child: Container(
        width: 48,
        height: 48,
        decoration: BoxDecoration(color: tone.withValues(alpha: 0.13), borderRadius: BorderRadius.circular(16)),
        child: Icon(Icons.devices_other_outlined, size: 24, color: tone),
      ),
    );
  }
}

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

Future<void> _addRequest(BuildContext context, WidgetRef ref, {WantedRequest? edit}) async {
  final saved = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (_) => _NewRequestSheet(initial: edit),
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
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 110),
        children: [
          const PageBanner(
            icon: Icons.manage_search_outlined,
            title: 'Help refurbishers find devices',
            subtitle: 'Refurbishers post the devices they are looking for. If you can help, accept the request and they will get in touch.',
          ),
          const SizedBox(height: 16),
          board.when(
            loading: () => const Skeleton(height: 120, radius: 24),
            error: (e, _) => ErrorState(error: e is ApiException ? e : ApiException.from(e), onRetry: () => ref.invalidate(wantedBoardProvider)),
            data: (items) => items.isEmpty
                ? const EmptyState(icon: Icons.manage_search_outlined, title: 'No requests right now', message: 'When a refurbisher posts a device they are looking for it appears here.')
                : Column(children: [for (var i = 0; i < items.length; i++) Padding(padding: const EdgeInsets.only(bottom: 12), child: _BoardCard(request: items[i], accent: AppColors.tileAccents[i % AppColors.tileAccents.length]))]),
          ),
        ],
      ),
    );
  }
}

class _BoardCard extends ConsumerStatefulWidget {
  const _BoardCard({required this.request, required this.accent});

  final WantedRequest request;
  final Color accent;

  @override
  ConsumerState<_BoardCard> createState() => _BoardCardState();
}

class _BoardCardState extends ConsumerState<_BoardCard> {
  Future<void> _accept() async {
    final done = await context.push<bool>(Routes.wantedAccept(widget.request.id), extra: widget.request);
    if (done == true) ref.invalidate(wantedBoardProvider);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final w = widget.request;
    final accent = AppColors.adapt(context, widget.accent);
    final ok = AppColors.adapt(context, AppColors.success);
    return GlassContainer(
      radius: 24,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _DeviceTile(accent: widget.accent),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(w.title, style: theme.textTheme.titleMedium, maxLines: 3, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 4),
                    Row(
                      children: [
                        Icon(Icons.storefront_outlined, size: 14, color: theme.textTheme.bodySmall?.color),
                        const SizedBox(width: 4),
                        Expanded(child: Text('Wanted by ${w.refurbisherName ?? 'a refurbisher'}', style: theme.textTheme.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis)),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _FactPills(w),
          if ((w.notes ?? '').isNotEmpty) ...[
            const SizedBox(height: 12),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: accent.withValues(alpha: 0.08), borderRadius: BorderRadius.circular(14), border: Border(left: BorderSide(color: accent, width: 3))),
              child: Text(w.notes!, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurface)),
            ),
          ],
          const SizedBox(height: 16),
          if (w.hasResponded)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
              decoration: BoxDecoration(color: ok.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(14)),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(Icons.check_circle_rounded, size: 20, color: ok),
                  const SizedBox(width: 8),
                  Text('Accepted', style: theme.textTheme.labelLarge?.copyWith(color: ok)),
                ],
              ),
            )
          else
            FilledButton(
              onPressed: _accept,
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(50)),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.handshake_outlined, size: 20),
                  const SizedBox(width: 8),
                  const Flexible(child: Text('Accept')),
                ],
              ),
            ),
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
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 110),
        children: [
          const PageBanner(
            icon: Icons.campaign_outlined,
            title: 'Tell owners what you need',
            subtitle: 'Open requests are visible to owners and technicians, and they can accept the ones they can help with.',
          ),
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
                : Column(children: [for (var i = 0; i < items.length; i++) Padding(padding: const EdgeInsets.only(bottom: 12), child: _MineCard(request: items[i], accent: AppColors.tileAccents[i % AppColors.tileAccents.length]))]),
          ),
        ],
      ),
    );
  }
}

class _MineCard extends ConsumerStatefulWidget {
  const _MineCard({required this.request, required this.accent});

  final WantedRequest request;
  final Color accent;

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
      radius: 24,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _DeviceTile(accent: w.isOpen ? widget.accent : theme.colorScheme.onSurface.withValues(alpha: 0.5)),
              const SizedBox(width: 14),
              Expanded(child: Text(w.title, style: theme.textTheme.titleMedium, maxLines: 3, overflow: TextOverflow.ellipsis)),
              const SizedBox(width: 8),
              StatusBadge(w.isOpen ? 'Open' : 'Closed', tone: w.isOpen ? BadgeTone.green : BadgeTone.neutral),
            ],
          ),
          const SizedBox(height: 14),
          _FactPills(w),
          const SizedBox(height: 14),
          Divider(height: 1, color: theme.colorScheme.outlineVariant),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              if (w.responseCount > 0) AppChip(label: '${w.responseCount} accepted', selected: _showWho, onTap: () => setState(() => _showWho = !_showWho)),
              _CardAction(icon: Icons.edit_outlined, label: 'Edit', onTap: _busy ? null : () async { await _addRequest(context, ref, edit: w); }),
              _CardAction(icon: w.isOpen ? Icons.lock_outline_rounded : Icons.lock_open_rounded, label: w.isOpen ? 'Close' : 'Reopen', onTap: _busy ? null : () => _do(() => repo.setStatus(w.id, w.isOpen ? 'closed' : 'open'))),
              _CardAction(icon: Icons.delete_outline_rounded, label: 'Delete', danger: true, onTap: _busy ? null : () => _do(() => repo.delete(w.id))),
            ],
          ),
          if (_showWho) _Responders(id: w.id),
        ],
      ),
    );
  }
}

/// A small outlined action under a card, such as Close or Delete.
class _CardAction extends StatelessWidget {
  const _CardAction({required this.icon, required this.label, required this.onTap, this.danger = false});

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool danger;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = danger ? theme.colorScheme.error : theme.colorScheme.onSurface;
    return Semantics(
      button: true,
      enabled: onTap != null,
      label: label,
      excludeSemantics: true,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: onTap ?? () {},
          child: ConstrainedBox(
            constraints: const BoxConstraints(minHeight: 44),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(22), border: Border.all(color: danger ? color.withValues(alpha: 0.5) : theme.colorScheme.outline)),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(icon, size: 17, color: color),
                  const SizedBox(width: 6),
                  Text(label, style: theme.textTheme.labelMedium?.copyWith(color: color, fontWeight: FontWeight.w700)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Responders extends ConsumerWidget {
  const _Responders({required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final who = ref.watch(wantedResponsesProvider(id));
    return who.when(
      loading: () => const Padding(padding: EdgeInsets.only(top: 12), child: LinearProgressIndicator()),
      error: (e, _) => const Padding(padding: EdgeInsets.only(top: 12), child: MessageBanner(message: 'Could not load who accepted.', tone: BannerTone.error)),
      data: (items) => Column(
        children: [
          for (final r in items)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(top: 12),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.06), borderRadius: BorderRadius.circular(16)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      ExcludeSemantics(
                        child: Container(
                          width: 34,
                          height: 34,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.14), shape: BoxShape.circle),
                          child: Icon(r.role == 'technician' ? Icons.build_rounded : Icons.person_rounded, size: 18, color: theme.colorScheme.primary),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(child: Text('${r.name} (${r.role == 'technician' ? 'technician' : 'device owner'})', style: theme.textTheme.titleSmall)),
                    ],
                  ),
                  if ((r.message ?? '').isNotEmpty) ...[const SizedBox(height: 8), Text(r.message!, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurface))],
                  const SizedBox(height: 8),
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
  const _NewRequestSheet({this.initial});

  /// The request being edited; null when adding a new one.
  final WantedRequest? initial;

  @override
  ConsumerState<_NewRequestSheet> createState() => _NewRequestSheetState();
}

class _NewRequestSheetState extends ConsumerState<_NewRequestSheet> {
  final _form = GlobalKey<FormState>();
  late final _title = TextEditingController(text: widget.initial?.title ?? '');
  late final _brand = TextEditingController(text: widget.initial?.brand ?? '');
  late final _quantity = TextEditingController(text: '${widget.initial?.quantity ?? 1}');
  late final _city = TextEditingController(text: widget.initial?.city ?? '');
  late final _notes = TextEditingController(text: widget.initial?.notes ?? '');
  late String _condition = widget.initial?.minCondition ?? '';
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
      final repo = ref.read(wantedRepositoryProvider);
      final quantity = int.tryParse(_quantity.text.trim()) ?? 1;
      final editing = widget.initial;
      if (editing == null) {
        await repo.create(title: _title.text, brand: _brand.text, minCondition: _condition, quantity: quantity, city: _city.text, notes: _notes.text);
      } else {
        await repo.update(editing.id, title: _title.text, brand: _brand.text, minCondition: _condition, quantity: quantity, city: _city.text, notes: _notes.text);
      }
      if (mounted) Navigator.pop(context, true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Widget _label(ThemeData theme, IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(top: 18, bottom: 10),
        child: Row(
          children: [
            Icon(icon, size: 18, color: theme.colorScheme.primary),
            const SizedBox(width: 8),
            Expanded(child: Semantics(header: true, child: Text(text, style: theme.textTheme.titleSmall))),
          ],
        ),
      );

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
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  ExcludeSemantics(
                    child: Container(
                      width: 48,
                      height: 48,
                      decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(16)),
                      child: Icon(Icons.campaign_outlined, color: theme.colorScheme.primary),
                    ),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(header: true, child: Text(widget.initial == null ? 'New request' : 'Edit request', style: theme.textTheme.titleLarge)),
                        const SizedBox(height: 2),
                        Text('Tell device owners what you are looking for. Open requests are visible to them.', style: theme.textTheme.bodySmall),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              if (_error != null) ...[MessageBanner(message: _error!, tone: BannerTone.error), const SizedBox(height: 12)],
              TextFormField(
                controller: _title,
                maxLength: 120,
                decoration: const InputDecoration(labelText: 'What are you looking for?', hintText: 'Used laptops, any brand', prefixIcon: Icon(Icons.search_rounded)),
                validator: (v) => (v ?? '').trim().length < 3 ? 'Say what you are looking for (at least 3 letters)' : null,
              ),
              TextFormField(controller: _brand, maxLength: 60, decoration: const InputDecoration(labelText: 'Brand (optional)', prefixIcon: Icon(Icons.sell_outlined))),
              _label(theme, Icons.verified_outlined, 'Worst condition you accept (optional)'),
              Wrap(spacing: 8, runSpacing: 8, children: [
                for (final (value, label) in conditions) AppChip(label: label, selected: _condition == value, onTap: () => setState(() => _condition = _condition == value ? '' : value)),
              ]),
              const SizedBox(height: 18),
              TextFormField(
                controller: _quantity,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'How many?', prefixIcon: Icon(Icons.numbers_rounded)),
                validator: (v) {
                  final n = int.tryParse((v ?? '').trim());
                  return n == null || n < 1 || n > 1000 ? 'Enter a number from 1 to 1000' : null;
                },
              ),
              const SizedBox(height: 12),
              DetectLocationButton(onDetected: (_, place) {
                if (place != null && place.city.isNotEmpty) setState(() => _city.text = place.city);
              }),
              const SizedBox(height: 12),
              TextFormField(controller: _city, maxLength: 80, decoration: const InputDecoration(labelText: 'City (optional)', prefixIcon: Icon(Icons.place_outlined))),
              TextFormField(controller: _notes, maxLines: 3, maxLength: 1000, decoration: const InputDecoration(labelText: 'Notes (optional)')),
              const SizedBox(height: 8),
              FilledButton(onPressed: _saving ? null : _save, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)), child: Text(_saving ? 'Saving…' : (widget.initial == null ? 'Add request' : 'Save changes'))),
            ],
          ),
        ),
      ),
    );
  }
}

const _acceptIdeas = [
  'I have this device and can hand it over this week.',
  'I have a few of these. Please message me to talk about the condition.',
  'I can give it for free.',
  'I would like to sell it. Please tell me what you can pay.',
];

/// Accept one wanted request, on a page of its own: what they are looking for in full, then a message and the Accept button.
class WantedAcceptScreen extends ConsumerStatefulWidget {
  const WantedAcceptScreen({super.key, required this.request});

  final WantedRequest request;

  @override
  ConsumerState<WantedAcceptScreen> createState() => _WantedAcceptScreenState();
}

class _WantedAcceptScreenState extends ConsumerState<WantedAcceptScreen> {
  final _message = TextEditingController();
  bool _sending = false;
  bool _done = false;
  String? _error;

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  Future<void> _accept() async {
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(wantedRepositoryProvider).respond(widget.request.id, message: _message.text);
      ref.invalidate(wantedBoardProvider);
      if (mounted) setState(() => _done = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final w = widget.request;
    final accepted = _done || w.hasResponded;
    final ok = AppColors.adapt(context, AppColors.success);
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Accept this request'),
      body: AppBackground(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
            children: [
              Text('Accept this request', style: theme.textTheme.headlineSmall),
              const SizedBox(height: 4),
              Text('Read what they are looking for, then tell them how you can help.', style: theme.textTheme.bodyMedium),
              const SizedBox(height: 16),
              GlassContainer(
                radius: 24,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(w.title, style: theme.textTheme.titleLarge),
                    const SizedBox(height: 12),
                    _FactPills(w),
                    if ((w.notes ?? '').isNotEmpty) ...[
                      const SizedBox(height: 14),
                      Text('What they wrote', style: theme.textTheme.titleSmall),
                      const SizedBox(height: 6),
                      Text(w.notes!, style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurface)),
                    ],
                    const SizedBox(height: 14),
                    Row(children: [
                      Icon(Icons.storefront_outlined, size: 16, color: theme.textTheme.bodySmall?.color),
                      const SizedBox(width: 6),
                      Expanded(child: Text('Wanted by ${w.refurbisherName ?? 'a refurbisher'}', style: theme.textTheme.bodyMedium)),
                    ]),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              if (accepted)
                GlassContainer(
                  radius: 24,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(children: [
                        Icon(Icons.check_circle_rounded, color: ok),
                        const SizedBox(width: 8),
                        Expanded(child: Text('You accepted this request', style: theme.textTheme.titleMedium)),
                      ]),
                      const SizedBox(height: 8),
                      Text('${w.refurbisherName ?? 'The refurbisher'} has been told that you can help. Watch your notifications and messages for their reply.', style: theme.textTheme.bodyMedium),
                      const SizedBox(height: 14),
                      FilledButton(onPressed: () => context.pop(true), child: const Text('See more requests')),
                    ],
                  ),
                )
              else
                GlassContainer(
                  radius: 24,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Tell them how you can help', style: theme.textTheme.titleMedium),
                      const SizedBox(height: 4),
                      Text('A short message is optional, but it helps them decide quickly. Tap an idea to start with it.', style: theme.textTheme.bodySmall),
                      const SizedBox(height: 10),
                      Wrap(spacing: 8, runSpacing: 8, children: [
                        for (final idea in _acceptIdeas) AppChip(label: idea, selected: _message.text == idea, onTap: () => setState(() => _message.text = idea)),
                      ]),
                      const SizedBox(height: 12),
                      TextField(controller: _message, maxLines: 4, maxLength: 1000, decoration: const InputDecoration(labelText: 'Your message (optional)', helperText: 'For example what device you have')),
                      if (_error != null) ...[const SizedBox(height: 4), MessageBanner(message: _error!, tone: BannerTone.error)],
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        onPressed: _sending ? null : _accept,
                        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                        icon: const Icon(Icons.handshake_outlined, size: 20),
                        label: Text(_sending ? 'Sending…' : 'Accept this request'),
                      ),
                      const SizedBox(height: 10),
                      Text('Accepting does not commit you to anything. You and the refurbisher agree the details together.', style: theme.textTheme.bodySmall),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
