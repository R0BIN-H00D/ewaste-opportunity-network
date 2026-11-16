import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/learning.dart';
import '../../providers/learning_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import 'learning_dialogs.dart';
import '../requests/request_dialogs.dart';
import 'opportunity_card.dart';

/// One supervised task: what it is, who supervises it, the places left and the deadline, and the button to apply.
class OpportunityDetailsScreen extends ConsumerWidget {
  const OpportunityDetailsScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final opportunity = ref.watch(opportunityProvider(id));
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Learning task'),
      body: AppBackground(
        child: SafeArea(
          child: opportunity.when(
            loading: () => ListView(padding: const EdgeInsets.all(20), children: const [Skeleton(height: 140, radius: 24), SizedBox(height: 16), Skeleton(height: 180, radius: 24)]),
            error: (e, _) => ListView(
              padding: const EdgeInsets.all(20),
              children: [
                ErrorState(
                  error: ApiException.from(e),
                  title: ApiException.from(e).failure == ApiFailure.notFound ? 'This task is not available' : null,
                  onRetry: () => ref.invalidate(opportunityProvider(id)),
                ),
              ],
            ),
            data: (o) => _Body(opportunity: o),
          ),
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.opportunity});

  final Opportunity opportunity;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _busy = false;
  String? _error;

  Opportunity get o => widget.opportunity;

  Future<void> _apply() async {
    final message = await askApplication(context, title: o.title);
    if (message == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final application = await ref.read(learningRepositoryProvider).apply(o.id, message: message);
      ref.invalidate(applicationsProvider);
      ref.invalidate(opportunitiesProvider);
      ref.invalidate(opportunityProvider(o.id));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Application sent. The supervisor has been told.')));
      context.pushReplacement(Routes.application(application.id));
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _toggle() async {
    final open = o.status != 'open';
    final ok = await askConfirm(
      context,
      title: open ? 'Open this task again?' : 'Close this task?',
      message: open ? 'Students can apply again.' : 'No new applications are accepted. Students already accepted can finish the task.',
      confirmLabel: open ? 'Open' : 'Close',
    );
    if (!ok) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(learningRepositoryProvider).setOpportunityOpen(o.id, open: open);
      ref.invalidate(opportunityProvider(o.id));
      ref.invalidate(myTasksProvider);
      ref.invalidate(opportunitiesProvider);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
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
    final block = o.applyBlock;
    final mine = o.myApplication;
    final supervisor = [o.supervisorName, o.supervisorCity].where((x) => x != null && x.trim().isNotEmpty).join(', ');
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      children: [
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(header: true, child: Text(o.title, style: theme.textTheme.headlineSmall)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  StatusBadge(labelOf(difficulties, o.difficulty), tone: difficultyTone(o.difficulty)),
                  if (o.categoryName != null) StatusBadge(o.categoryName!, tone: BadgeTone.neutral),
                  StatusBadge(seatsText(o), tone: o.seatsLeft > 0 ? BadgeTone.neutral : BadgeTone.red),
                ],
              ),
              if ((o.description ?? '').trim().isNotEmpty) ...[const SizedBox(height: 12), Text(o.description!.trim(), style: theme.textTheme.bodyLarge)],
              const SizedBox(height: 4),
              if (o.locationArea.isNotEmpty) _fact(theme, 'Area', o.locationArea),
              if (o.deadline != null) _fact(theme, 'Apply by', formatDate(o.deadline)),
              if (o.expectedHours != null) _fact(theme, 'Expected time', '${o.expectedHours!.toStringAsFixed(o.expectedHours! == o.expectedHours!.roundToDouble() ? 0 : 1)} hours'),
              _fact(theme, 'Places', '${o.seatsTaken} of ${o.seats} taken'),
              if (o.skills.isNotEmpty) _fact(theme, 'Skills', o.skills.join(', ')),
            ],
          ),
        ),
        if (supervisor.isNotEmpty) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Row(
              children: [
                Icon(Icons.verified_user_outlined, color: theme.colorScheme.primary),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Supervised by', style: theme.textTheme.bodyMedium),
                      Text(supervisor, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16)),
                      if ((o.supervisorHeadline ?? '').trim().isNotEmpty) Text(o.supervisorHeadline!.trim(), style: theme.textTheme.bodyMedium),
                      Text(o.hasSupervisorRating ? '${o.supervisorRating.toStringAsFixed(1)} (${o.supervisorRatingCount} ${o.supervisorRatingCount == 1 ? 'review' : 'reviews'})' : 'No reviews yet', style: theme.textTheme.bodyMedium),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        const MessageBanner(message: 'A verified technician supervises you the whole time. Tasks never involve hazardous handling.'),
        if (_error != null) ...[const SizedBox(height: 12), MessageBanner(message: _error!, tone: BannerTone.error)],
        const SizedBox(height: 16),
        if (o.isSupervisorView) ...[
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text('Your task', style: theme.textTheme.titleLarge)),
                _fact(theme, 'Status', labelOf(opportunityStatuses, o.status)),
                _fact(theme, 'Applicants', o.counts.isEmpty ? 'None yet' : [for (final e in o.counts.entries) if (e.value > 0) '${e.value} ${applicationStatusLabel(e.key).toLowerCase()}'].join(', ')),
                const SizedBox(height: 8),
                FilledButton.icon(
                  onPressed: () => context.push(Routes.applicants(o.id)),
                  icon: const Icon(Icons.people_outline),
                  label: Text(o.pendingApplicants > 0 ? 'See applicants (${o.pendingApplicants} waiting)' : 'See applicants'),
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                ),
                const SizedBox(height: 8),
                OutlinedButton.icon(onPressed: () => context.push(Routes.taskEdit(o.id)), icon: const Icon(Icons.edit_outlined), label: const Text('Edit task'), style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48))),
                const SizedBox(height: 8),
                OutlinedButton.icon(
                  onPressed: _busy || o.status == 'filled' ? null : _toggle,
                  icon: Icon(o.status == 'open' ? Icons.lock_outline : Icons.lock_open_outlined),
                  label: Text(o.status == 'open' ? 'Close to new applications' : 'Open again'),
                  style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                ),
              ],
            ),
          ),
        ] else if (mine != null) ...[
          StatusBadge('Your application: ${applicationStatusLabel(mine.status)}', tone: applicationTone(mine.status)),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: () => context.push(Routes.application(mine.id)),
            icon: const Icon(Icons.assignment_turned_in_outlined),
            label: const Text('See my application'),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          ),
        ] else if (block != null) ...[
          MessageBanner(message: applyBlockMessages[block] ?? 'You cannot apply to this task right now.', tone: BannerTone.warning),
          if (block == 'not_verified') Padding(padding: const EdgeInsets.only(top: 4), child: TextButton(onPressed: () => context.push(Routes.verification), child: const Text('Open verification'))),
        ] else if (!o.isStudentView)
          const MessageBanner(message: 'Only students can apply. Sign in with a student account to apply for tasks.')
        else
          FilledButton.icon(
            onPressed: _busy ? null : _apply,
            icon: const Icon(Icons.send_outlined),
            label: const Text('Apply for this task'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          ),
      ],
    );
  }
}
