import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../providers/learning_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import 'applications_screen.dart' show applicationFilters;
import 'opportunity_card.dart';

final List<(String, String)> _filters = [('', 'All'), for (final s in applicationFilters) (s, applicationStatusLabel(s))];

/// The students who applied to one of the supervisor's tasks, with a status filter. Tapping one opens the application.
class ApplicantsScreen extends ConsumerStatefulWidget {
  const ApplicantsScreen({super.key, required this.opportunityId});

  final String opportunityId;

  @override
  ConsumerState<ApplicantsScreen> createState() => _ApplicantsScreenState();
}

class _ApplicantsScreenState extends ConsumerState<ApplicantsScreen> {
  String _status = '';

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final key = (id: widget.opportunityId, status: _status);
    final list = ref.watch(applicantsProvider(key));
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Applicants'),
      body: AppBackground(
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () async => ref.refresh(applicantsProvider(key).future),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(20),
              children: [
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [
                    for (final (value, label) in _filters) ...[
                      if (value.isNotEmpty) const SizedBox(width: 8),
                      AppChip(label: label, selected: _status == value, onTap: () => setState(() => _status = value)),
                    ],
                  ]),
                ),
                const SizedBox(height: 12),
                ...list.when(
                  skipLoadingOnReload: true,
                  loading: () => const [Skeleton(height: 90, radius: 24), SizedBox(height: 12), Skeleton(height: 90, radius: 24)],
                  error: (e, _) => [ErrorState(error: ApiException.from(e), onRetry: () => ref.invalidate(applicantsProvider(key)))],
                  data: (items) => items.isEmpty
                      ? const [EmptyState(icon: Icons.people_outline, title: 'No applicants here', message: 'Students who apply to this task appear here.')]
                      : [
                          for (final a in items) ...[
                            GlassContainer(
                              padding: EdgeInsets.zero,
                              child: Material(
                                type: MaterialType.transparency,
                                child: InkWell(
                                  borderRadius: BorderRadius.circular(24),
                                  onTap: () => context.push(Routes.application(a.id)),
                                  child: Padding(
                                    padding: const EdgeInsets.all(14),
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(a.studentName ?? 'Student', style: theme.textTheme.titleLarge?.copyWith(fontSize: 16)),
                                        if ([a.student.college, a.student.course].any((v) => (v ?? '').isNotEmpty))
                                          Text([a.student.college, a.student.course].where((v) => (v ?? '').isNotEmpty).join(' · '), style: theme.textTheme.bodyMedium),
                                        const SizedBox(height: 6),
                                        Wrap(spacing: 6, runSpacing: 6, children: [
                                          StatusBadge(applicationStatusLabel(a.status), tone: applicationTone(a.status)),
                                          if (a.student.totalHours > 0) StatusBadge('${formatHours(a.student.totalHours)} so far', tone: BadgeTone.neutral),
                                        ]),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 12),
                          ],
                        ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
