import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../providers/learning_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';

/// What a student has finished: total hours, skills, each completed task, and the certificates an administrator issued.
class ExperienceScreen extends ConsumerWidget {
  const ExperienceScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final experience = ref.watch(experienceProvider);
    final certificates = ref.watch(certificatesProvider);
    Future<void> refresh() async {
      ref.invalidate(experienceProvider);
      ref.invalidate(certificatesProvider);
      await ref.read(experienceProvider.future);
    }

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Experience'),
      body: AppBackground(
        child: SafeArea(
          child: experience.when(
            loading: () => ListView(padding: const EdgeInsets.all(20), children: const [Skeleton(height: 120, radius: 24), SizedBox(height: 16), Skeleton(height: 160, radius: 24)]),
            error: (e, _) => ListView(padding: const EdgeInsets.all(20), children: [ErrorState(error: ApiException.from(e), onRetry: () => ref.invalidate(experienceProvider))]),
            data: (x) => RefreshIndicator(
              onRefresh: refresh,
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
                children: [
                  GlassContainer(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(header: true, child: Text('Your experience', style: theme.textTheme.titleLarge)),
                        const SizedBox(height: 8),
                        Text(formatHours(x.summary.totalHours), style: theme.textTheme.headlineMedium?.copyWith(color: theme.colorScheme.primary)),
                        Text('${x.summary.completedCount} ${x.summary.completedCount == 1 ? 'task' : 'tasks'} completed', style: theme.textTheme.bodyLarge),
                        if ([x.summary.college, x.summary.course].any((p) => (p ?? '').trim().isNotEmpty))
                          Padding(padding: const EdgeInsets.only(top: 8), child: Text([x.summary.college, x.summary.course].where((p) => (p ?? '').trim().isNotEmpty).join(' · '), style: theme.textTheme.bodyMedium)),
                        if (x.summary.skills.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text('Skills: ${x.summary.skills.join(', ')}', style: theme.textTheme.bodyMedium)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  GlassContainer(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(header: true, child: Text('Certificates', style: theme.textTheme.titleLarge)),
                        const SizedBox(height: 6),
                        certificates.when(
                          loading: () => const Skeleton(height: 60, radius: 16),
                          error: (e, _) => ErrorState(error: ApiException.from(e), onRetry: () => ref.invalidate(certificatesProvider)),
                          data: (list) => list.isEmpty
                              ? Text('No certificates yet. After a task is completed, an administrator can issue one.', style: theme.textTheme.bodyMedium)
                              : Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    for (final c in list)
                                      Padding(
                                        padding: const EdgeInsets.only(top: 10),
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(c.certNo, style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
                                            if ((c.taskTitle ?? '').isNotEmpty) Text(c.taskTitle!, style: theme.textTheme.bodyLarge),
                                            Text([if (c.hours > 0) formatHours(c.hours), if (c.issuedAt != null) 'Issued ${formatDate(c.issuedAt)}'].join(' · '), style: theme.textTheme.bodyMedium),
                                          ],
                                        ),
                                      ),
                                  ],
                                ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  GlassContainer(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(header: true, child: Text('Completed tasks', style: theme.textTheme.titleLarge)),
                        if (x.items.isEmpty)
                          Padding(padding: const EdgeInsets.only(top: 6), child: Text('Nothing completed yet. Finish a supervised task and it appears here.', style: theme.textTheme.bodyMedium))
                        else
                          for (final a in x.items)
                            InkWell(
                              onTap: () => context.push(Routes.application(a.id)),
                              child: Padding(
                                padding: const EdgeInsets.symmetric(vertical: 8),
                                child: Row(
                                  children: [
                                    Expanded(
                                      child: Column(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Text(a.opportunityTitle, style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600)),
                                          Text([formatHours(a.hours), if (a.completedAt != null) formatDate(a.completedAt)].join(' · '), style: theme.textTheme.bodyMedium),
                                        ],
                                      ),
                                    ),
                                    const Icon(Icons.chevron_right),
                                  ],
                                ),
                              ),
                            ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
