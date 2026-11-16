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
import '../requests/request_dialogs.dart';
import '../../services/learning_repository.dart';
import 'learning_dialogs.dart';
import 'opportunity_card.dart';

/// One plain sentence on where the application stands and what happens next.
String applicationHint(Application a) {
  final who = a.supervisorName ?? 'The supervisor';
  switch (a.status) {
    case 'applied':
      return '$who will review your application. You can withdraw until the task is finished.';
    case 'accepted':
      return '$who accepted you. They will start the task with you.';
    case 'in_progress':
      return 'The task is under way with $who supervising you. They record your hours when it is done.';
    case 'completed':
      return a.certificate != null ? 'Done. Your certificate is ready.' : 'Done. An administrator can now issue your participation certificate.';
    case 'rejected':
      return '$who did not select you this time. Other tasks are waiting for you.';
    default:
      return 'You withdrew this application. You can apply again if the task is still open.';
  }
}

/// The same sentence from the supervisor's side.
String supervisorApplicationHint(Application a) {
  final who = a.studentName ?? 'The student';
  switch (a.status) {
    case 'applied':
      return '$who applied. Accept to give them a place, or decline with a note.';
    case 'accepted':
      return '$who has a place. Start the task when you begin working together.';
    case 'in_progress':
      return 'The task is under way. Finish it when it is done and record the hours $who worked.';
    case 'completed':
      return 'Done. The hours are recorded and an administrator can issue the certificate.';
    case 'rejected':
      return 'You declined this application.';
    default:
      return '$who withdrew this application.';
  }
}

class ApplicationDetailsScreen extends ConsumerWidget {
  const ApplicationDetailsScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final application = ref.watch(applicationProvider(id));
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Application'),
      body: AppBackground(
        child: SafeArea(
          child: application.when(
            skipLoadingOnReload: true,
            loading: () => ListView(padding: const EdgeInsets.all(20), children: const [Skeleton(height: 120, radius: 24), SizedBox(height: 16), Skeleton(height: 160, radius: 24)]),
            error: (e, _) => ListView(
              padding: const EdgeInsets.all(20),
              children: [
                ErrorState(
                  error: ApiException.from(e),
                  title: ApiException.from(e).failure == ApiFailure.notFound ? 'This application is not available' : null,
                  onRetry: () => ref.invalidate(applicationProvider(id)),
                ),
              ],
            ),
            data: (a) => RefreshIndicator(onRefresh: () => ref.read(applicationProvider(id).notifier).refresh(), child: _Body(application: a)),
          ),
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.application});

  final Application application;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _busy = false;
  String? _error;

  Application get a => widget.application;

  Future<void> _withdraw() async {
    final answer = await askReason(
      context,
      title: 'Withdraw this application?',
      confirmLabel: 'Withdraw',
      message: a.status == 'applied' ? 'The supervisor is told.' : 'The supervisor is told and your place is given to someone else.',
    );
    if (answer == null) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(applicationProvider(a.id).notifier).run((repo) => repo.withdraw(a.id, reason: answer.reason));
      ref.invalidate(opportunitiesProvider);
      ref.invalidate(opportunityProvider(a.opportunityId));
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Application withdrawn')));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.message);
      if (e.code == 'STALE_STATE' || e.failure == ApiFailure.conflict) await ref.read(applicationProvider(a.id).notifier).refresh();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Runs one supervisor action and shows what the server said if it refuses.
  Future<void> _supervise(Future<Application> Function(LearningRepository repo) action, {String? done}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(applicationProvider(a.id).notifier).run((repo) => action(repo));
      ref.invalidate(myTasksProvider);
      ref.invalidate(opportunityProvider(a.opportunityId));
      if (done != null && mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(done)));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message);
      if (e.code == 'STALE_STATE' || e.failure == ApiFailure.conflict) await ref.read(applicationProvider(a.id).notifier).refresh();
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _decide({required bool accept}) async {
    final answer = await askReason(
      context,
      title: accept ? 'Accept ${a.studentName ?? 'this student'}?' : 'Decline ${a.studentName ?? 'this student'}?',
      confirmLabel: accept ? 'Accept' : 'Decline',
      message: accept ? 'They are told they have a place. You can add a note.' : 'They are told. You can add a note.',
      offerCancel: false,
    );
    if (answer == null) return;
    await _supervise((repo) => repo.decide(a.id, accept: accept, feedback: answer.reason), done: accept ? 'Student accepted' : 'Application declined');
  }

  Future<void> _start() async {
    final ok = await askConfirm(context, title: 'Start the task?', message: 'Confirm that you are starting the task with ${a.studentName ?? 'the student'} now and will supervise them.', confirmLabel: 'Start');
    if (!ok) return;
    await _supervise((repo) => repo.start(a.id), done: 'Task started');
  }

  Future<void> _complete() async {
    final done = await askCompletion(context, studentName: a.studentName ?? 'the student');
    if (done == null) return;
    await _supervise((repo) => repo.complete(a.id, hours: done.hours, feedback: done.feedback), done: 'Task finished');
  }

  Widget _action(String label, IconData icon, VoidCallback onTap, {bool primary = false}) => Padding(
        padding: const EdgeInsets.only(top: 8),
        child: primary
            ? FilledButton.icon(onPressed: _busy ? null : onTap, icon: Icon(icon), label: Text(label), style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)))
            : OutlinedButton.icon(onPressed: _busy ? null : onTap, icon: Icon(icon), label: Text(label), style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48))),
      );

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
    final latestFirst = a.history.reversed.toList();
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      children: [
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(header: true, child: Text(a.opportunityTitle, style: theme.textTheme.titleLarge)),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  StatusBadge(applicationStatusLabel(a.status), tone: applicationTone(a.status)),
                  if (a.difficulty != null) StatusBadge(labelOf(difficulties, a.difficulty), tone: difficultyTone(a.difficulty!)),
                ],
              ),
              const SizedBox(height: 12),
              Text(a.isSupervisorView ? supervisorApplicationHint(a) : applicationHint(a), style: theme.textTheme.bodyLarge),
              if (_error != null) ...[const SizedBox(height: 12), MessageBanner(message: _error!, tone: BannerTone.error)],
              if ((a.supervisorFeedback ?? '').trim().isNotEmpty) ...[
                const SizedBox(height: 12),
                MessageBanner(message: 'From the supervisor: ${a.supervisorFeedback!.trim()}', tone: a.status == 'rejected' ? BannerTone.warning : BannerTone.info),
              ],
              if (a.can('withdraw'))
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: OutlinedButton.icon(
                    onPressed: _busy ? null : _withdraw,
                    icon: const Icon(Icons.undo_outlined),
                    label: const Text('Withdraw application'),
                    style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
                  ),
                ),
              if (a.can('accept')) _action('Accept', Icons.check_circle_outline, () => _decide(accept: true), primary: true),
              if (a.can('start')) _action('Start the task', Icons.play_arrow_outlined, _start, primary: true),
              if (a.can('complete')) _action('Finish and record hours', Icons.task_alt_outlined, _complete, primary: true),
              if (a.can('reject')) _action('Decline', Icons.close, () => _decide(accept: false)),
              if (a.opportunityId.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: TextButton(onPressed: () => context.push(Routes.opportunity(a.opportunityId)), child: const Text('View the task'))),
            ],
          ),
        ),
        const SizedBox(height: 16),
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(header: true, child: Text('The task', style: theme.textTheme.titleLarge)),
              if (a.supervisorName != null) _fact(theme, 'Supervisor', a.supervisorName!),
              if ((a.locationArea ?? '').isNotEmpty) _fact(theme, 'Area', a.locationArea!),
              if (a.categoryName != null) _fact(theme, 'Device', a.categoryName!),
              if (a.deadline != null) _fact(theme, 'Apply by', formatDate(a.deadline)),
              if (a.skills.isNotEmpty) _fact(theme, 'Skills', a.skills.join(', ')),
              if ((a.message ?? '').trim().isNotEmpty) _fact(theme, a.isSupervisorView ? 'Their note' : 'Your note', a.message!.trim()),
              if (a.startedAt != null) _fact(theme, 'Started', formatDate(a.startedAt)),
              if (a.completedAt != null) _fact(theme, 'Completed', formatDate(a.completedAt)),
              if (a.hours > 0) _fact(theme, 'Hours recorded', formatHours(a.hours)),
              if (a.certificate != null) _fact(theme, 'Certificate', a.certificate!),
            ],
          ),
        ),
        if (a.isSupervisorView) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text('The student', style: theme.textTheme.titleLarge)),
                if (a.studentName != null) _fact(theme, 'Name', a.studentName!),
                if ((a.student.college ?? '').isNotEmpty) _fact(theme, 'College', a.student.college!),
                if ((a.student.course ?? '').isNotEmpty) _fact(theme, 'Course', a.student.yearOfStudy == null ? a.student.course! : '${a.student.course}, year ${a.student.yearOfStudy}'),
                if (a.student.totalHours > 0) _fact(theme, 'Hours so far', formatHours(a.student.totalHours)),
                if (a.student.skills.isNotEmpty) _fact(theme, 'Skills', a.student.skills.join(', ')),
                const SizedBox(height: 8),
                Text('Contact details are never shared. You work with the student at the task.', style: theme.textTheme.bodyMedium),
              ],
            ),
          ),
        ],
        if (latestFirst.isNotEmpty) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text('History', style: theme.textTheme.titleLarge)),
                const SizedBox(height: 10),
                for (var i = 0; i < latestFirst.length; i++)
                  Semantics(
                    label: [
                      '${applicationStatusLabel(latestFirst[i].status)}. ${formatDateTime(latestFirst[i].at)}.',
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
                                Text(applicationStatusLabel(latestFirst[i].status), style: theme.textTheme.bodyLarge?.copyWith(fontWeight: i == 0 ? FontWeight.w700 : FontWeight.w500)),
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
          ),
        ],
      ],
    );
  }
}
