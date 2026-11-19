import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/theme/app_colors.dart';
import '../../routes/route_paths.dart';
import '../../services/admin_repository.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/menu_section.dart';
import '../../widgets/page_banner.dart';
import '../../widgets/state_views.dart';
import 'admin_catalog.dart';
import 'admin_record_page.dart';
import 'admin_widgets.dart';

enum AdminHomeGroup {
  administration('Administration', Icons.verified_user_outlined, 2),
  reports('Reports', Icons.bar_chart_rounded, 3),
  recent('Recent Activity', Icons.history_rounded, 1),
  community('Community', Icons.groups_outlined, 0),
  complaints('Complaints', Icons.assignment_outlined, 4),
  announcements('Announcements', Icons.campaign_outlined, 5);

  const AdminHomeGroup(this.title, this.icon, this.accent);
  final String title;
  final IconData icon;
  final int accent;
}

final adminOverviewProvider = FutureProvider.autoDispose<AdminRecord>(
  (ref) => ref.watch(adminRepositoryProvider).record('dashboard'),
);

String _tool(AdminSection section, [Map<String, String> filters = const {}]) => Uri(
      path: Routes.adminTool(section.name),
      queryParameters: filters.isEmpty ? null : filters,
    ).toString();

String _summary(Object? count, String single, String plural, String fallback) =>
    count is num ? '$count ${count == 1 ? single : plural}' : fallback;

class AdminHome extends ConsumerWidget {
  const AdminHome({super.key, required this.name});

  final String name;

  Future<void> _open(BuildContext context, WidgetRef ref, String location) async {
    await context.push(location);
    if (context.mounted) ref.invalidate(adminOverviewProvider);
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final overview = ref.watch(adminOverviewProvider);
    final data = overview.valueOrNull ?? const <String, dynamic>{};
    final attention = adminRecord(data['attention']);
    final pending = adminRecord(attention['pendingVerifications']);
    final people = adminRecord(data['people']);
    final summaries = {
      AdminHomeGroup.administration:
          _summary(pending['total'], 'pending verification', 'pending verifications', 'Review verification requests'),
      AdminHomeGroup.reports:
          _summary(attention['openReports'], 'open report', 'open reports', 'Reports, analytics and audit log'),
      AdminHomeGroup.recent: 'Latest administrator actions',
      AdminHomeGroup.community: _summary(people['total'], 'person', 'people', 'View people by role'),
      AdminHomeGroup.complaints:
          _summary(attention['openComplaints'], 'active complaint', 'active complaints', 'Review complaints'),
      AdminHomeGroup.announcements: 'Publish and schedule updates',
    };
    return RefreshIndicator(
      onRefresh: () => ref.refresh(adminOverviewProvider.future).then<void>((_) {}, onError: (Object _) {}),
      child: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
        children: [
          PageBanner(icon: Icons.admin_panel_settings_outlined, title: 'Admin dashboard', subtitle: name),
          const SizedBox(height: 20),
          LayoutBuilder(builder: (context, box) {
            const gap = 12.0;
            final twoColumns = box.maxWidth >= 320 && MediaQuery.textScalerOf(context).scale(16) <= 21;
            final columnWidth = twoColumns ? (box.maxWidth - gap) / 2 : box.maxWidth;
            return Wrap(
              spacing: gap,
              runSpacing: gap,
              children: [
                for (final group in AdminHomeGroup.values)
                  SizedBox(
                    width: group == AdminHomeGroup.administration || group == AdminHomeGroup.announcements
                        ? box.maxWidth
                        : columnWidth,
                    child: _DashboardCard(
                      group: group,
                      summary: summaries[group]!,
                      compact:
                          twoColumns && group != AdminHomeGroup.administration && group != AdminHomeGroup.announcements,
                      onTap: () => _open(
                          context,
                          ref,
                          switch (group) {
                            AdminHomeGroup.complaints => _tool(AdminSection.complaints, {'status': 'active'}),
                            AdminHomeGroup.announcements => _tool(AdminSection.announcements),
                            _ => Routes.adminGroup(group.name),
                          }),
                    ),
                  ),
              ],
            );
          }),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => _open(context, ref, Routes.admin),
              icon: const Icon(Icons.dashboard_customize_outlined),
              label: const Text('All admin tools'),
            ),
          ),
        ],
      ),
    );
  }
}

class _DashboardCard extends StatelessWidget {
  const _DashboardCard({required this.group, required this.summary, required this.compact, required this.onTap});
  final AdminHomeGroup group;
  final String summary;
  final bool compact;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = AppColors.adapt(context, AppColors.tileAccents[group.accent]);
    final icon = ExcludeSemantics(
      child: Container(
        width: 42,
        height: 42,
        decoration: BoxDecoration(color: color.withValues(alpha: 0.14), borderRadius: BorderRadius.circular(13)),
        child: Icon(group.icon, color: color, size: 23),
      ),
    );
    final arrow =
        ExcludeSemantics(child: Icon(Icons.arrow_forward_rounded, size: 18, color: theme.colorScheme.primary));
    final labels = Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(group.title, style: theme.textTheme.titleMedium),
        const SizedBox(height: 4),
        Text(summary, style: theme.textTheme.bodySmall),
      ],
    );
    return GlassContainer(
      radius: 22,
      padding: EdgeInsets.zero,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: compact
                ? ConstrainedBox(
                    constraints: const BoxConstraints(minHeight: 104),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [icon, arrow]),
                      const SizedBox(height: 10),
                      labels,
                    ]),
                  )
                : Row(children: [
                    icon,
                    const SizedBox(width: 14),
                    Expanded(child: labels),
                    const SizedBox(width: 8),
                    arrow
                  ]),
          ),
        ),
      ),
    );
  }
}

class AdminHomeGroupPage extends StatelessWidget {
  const AdminHomeGroupPage({super.key, required this.group, this.inTab = false});

  final AdminHomeGroup group;
  final bool inTab;

  MenuRow _row(BuildContext context, String title, String subtitle, IconData icon, String location) => MenuRow(
        icon: icon,
        accent: AppColors.tileAccents[group.accent],
        title: title,
        subtitle: subtitle,
        onTap: () => context.push(location),
      );

  Widget _verification(BuildContext context, String status, String caption) => MenuSection(
        caption: caption,
        rows: [
          _row(context, 'Service providers', 'Technicians, refurbishers and recycling centres', Icons.badge_outlined,
              _tool(AdminSection.verifications, {'type': 'provider', 'status': status})),
          _row(context, 'Recipient organisations', 'Schools and other donation recipients', Icons.business_outlined,
              _tool(AdminSection.verifications, {'type': 'recipient', 'status': status})),
        ],
      );

  List<Widget> _sections(BuildContext context) => switch (group) {
        AdminHomeGroup.administration => [
            _verification(context, 'pending', 'Pending verification'),
            const SizedBox(height: 18),
            _verification(context, 'approved', 'Approved verification'),
          ],
        AdminHomeGroup.reports => [
            for (final (section, accent, description) in const [
              (AdminSection.reports, 3, 'Review flagged content and accounts'),
              (AdminSection.analytics, 0, 'Explore trends, impact and CSV exports'),
              (AdminSection.audit, 1, 'Trace decisions and administrator actions'),
            ]) ...[
              MenuSection(rows: [
                MenuRow(
                  icon: section.icon,
                  accent: AppColors.tileAccents[accent],
                  title: section.title,
                  subtitle: description,
                  onTap: () => context.push(_tool(section)),
                ),
              ]),
              const SizedBox(height: 12),
            ],
          ],
        AdminHomeGroup.community => [
            MenuSection(rows: [
              _row(context, 'Current end users', 'View member accounts', Icons.person_outline,
                  _tool(AdminSection.users, {'role': 'user'})),
              _row(context, 'Technicians', 'View repair team accounts', Icons.build_outlined,
                  _tool(AdminSection.users, {'role': 'technician'})),
              _row(context, 'Refurbishment team', 'View refurbisher accounts', Icons.autorenew_rounded,
                  _tool(AdminSection.users, {'role': 'refurbisher'})),
              _row(context, 'Recycling team', 'View recycling centre accounts', Icons.recycling_rounded,
                  _tool(AdminSection.users, {'role': 'recycler'})),
            ]),
          ],
        AdminHomeGroup.complaints => [
            MenuSection(rows: [
              _row(context, 'Complaints', 'Review and resolve complaints', Icons.assignment_outlined,
                  _tool(AdminSection.complaints)),
            ]),
          ],
        AdminHomeGroup.announcements => [
            MenuSection(rows: [
              _row(context, 'Announcements', 'Publish and schedule updates', Icons.campaign_outlined,
                  _tool(AdminSection.announcements)),
            ]),
          ],
        AdminHomeGroup.recent => [],
      };

  @override
  Widget build(BuildContext context) => AdminScaffold(
        title: inTab ? 'Verification' : group.title,
        inTab: inTab,
        child: group == AdminHomeGroup.recent
            ? _RecentAdminActivity(openAudit: () => context.push(_tool(AdminSection.audit)))
            : ListView(
                padding: EdgeInsets.fromLTRB(20, 12, 20, inTab ? 120 : 28),
                children: _sections(context),
              ),
      );
}

class _RecentAdminActivity extends ConsumerWidget {
  const _RecentAdminActivity({required this.openAudit});
  final VoidCallback openAudit;

  @override
  Widget build(BuildContext context, WidgetRef ref) => AdminLoad(
        future: ref.watch(adminOverviewProvider.future),
        retry: () => ref.invalidate(adminOverviewProvider),
        builder: (context, data) {
          final entries = adminRecords(data['recentActivity']);
          final theme = Theme.of(context);
          final today = DateTime.now();
          final yesterday = DateTime(today.year, today.month, today.day - 1);
          final byDay = <DateTime?, List<AdminRecord>>{};
          for (final entry in entries) {
            final at = _activityTime(entry);
            byDay.putIfAbsent(at == null ? null : DateUtils.dateOnly(at), () => []).add(entry);
          }
          String dayLabel(DateTime? date) {
            if (date == null) return 'Date unavailable';
            if (DateUtils.isSameDay(date, today)) return 'Today';
            if (DateUtils.isSameDay(date, yesterday)) return 'Yesterday';
            return formatDate(date);
          }

          return RefreshIndicator(
            onRefresh: () => ref.refresh(adminOverviewProvider.future).then<void>((_) {}, onError: (Object _) {}),
            child: ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
              children: [
                AdminPanel(children: [
                  Wrap(
                    alignment: WrapAlignment.spaceBetween,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 12,
                    runSpacing: 6,
                    children: [
                      Text('Latest admin actions', style: theme.textTheme.titleMedium),
                      OutlinedButton.icon(
                        onPressed: openAudit,
                        icon: const Icon(Icons.arrow_forward_rounded),
                        label: const Text('Open audit log'),
                      ),
                    ],
                  ),
                ]),
                const SizedBox(height: 18),
                if (entries.isEmpty)
                  const EmptyState(
                    icon: Icons.history_rounded,
                    title: 'No administrator activity yet',
                    message: 'Verification decisions, moderation, and other admin actions will appear here.',
                  ),
                for (final day in byDay.entries) ...[
                  Padding(
                    padding: const EdgeInsets.fromLTRB(2, 4, 0, 8),
                    child: Semantics(header: true, child: Text(dayLabel(day.key), style: theme.textTheme.titleSmall)),
                  ),
                  for (final (index, entry) in day.value.indexed)
                    _TimelineEntry(
                      entry: entry,
                      first: index == 0,
                      last: index == day.value.length - 1,
                      onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                        builder: (_) => AdminRecordPage(
                          repository: ref.read(adminRepositoryProvider),
                          section: AdminSection.audit,
                          item: entry,
                        ),
                      )),
                    ),
                  const SizedBox(height: 10),
                ],
              ],
            ),
          );
        },
      );
}

DateTime? _activityTime(AdminRecord entry) =>
    DateTime.tryParse((entry['at'] ?? entry['createdAt'] ?? '').toString())?.toLocal();

class _TimelineEntry extends StatelessWidget {
  const _TimelineEntry({required this.entry, required this.first, required this.last, required this.onTap});
  final AdminRecord entry;
  final bool first;
  final bool last;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final action = (entry['action'] ?? '').toString();
    final (icon, accent) = switch (action.split('.').first) {
      'verification' => (Icons.verified_user_outlined, 0),
      'user' => (Icons.manage_accounts_outlined, 2),
      'complaint' => (Icons.assignment_outlined, 4),
      'report' || 'listing' || 'review' || 'product' => (Icons.flag_outlined, 3),
      'announcement' => (Icons.campaign_outlined, 5),
      'export' => (Icons.download_outlined, 1),
      'category' => (Icons.category_outlined, 5),
      _ => (Icons.history_rounded, 1),
    };
    final color = AppColors.adapt(context, AppColors.tileAccents[accent]);
    final at = _activityTime(entry);
    final time = at == null
        ? null
        : MaterialLocalizations.of(context).formatTimeOfDay(
            TimeOfDay.fromDateTime(at),
            alwaysUse24HourFormat: MediaQuery.alwaysUse24HourFormatOf(context),
          );
    final actor = adminRecord(entry['admin'])['name']?.toString();
    final label = switch (action) {
      'verification.resubmission_required' => 'Requested new verification documents',
      'verification.document_viewed' => 'Opened verification document',
      'report.actioned' => 'Report handled',
      'complaint.review_started' => 'Complaint review started',
      'user.reactivated' => 'Account reactivated',
      'user.suspended' => 'Account suspended',
      '' => 'Administrator action',
      _ => adminLabel(action),
    };
    final rail = theme.colorScheme.outlineVariant;

    return Stack(children: [
      if (!first) Positioned(left: 18, top: 0, height: 24, width: 2, child: ColoredBox(color: rail)),
      if (!last) Positioned(left: 18, top: 24, bottom: 0, width: 2, child: ColoredBox(color: rail)),
      Positioned(
        left: 0,
        top: 5,
        child: ExcludeSemantics(
          child: Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
                color: Color.alphaBlend(color.withValues(alpha: 0.15), theme.colorScheme.surface),
                shape: BoxShape.circle),
            child: Icon(icon, size: 19, color: color),
          ),
        ),
      ),
      Padding(
        padding: const EdgeInsets.only(left: 50, bottom: 10),
        child: GlassContainer(
          radius: 18,
          padding: EdgeInsets.zero,
          child: Material(
            type: MaterialType.transparency,
            child: InkWell(
              borderRadius: BorderRadius.circular(18),
              onTap: onTap,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                child: Row(children: [
                  Expanded(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(label, style: theme.textTheme.titleSmall),
                      const SizedBox(height: 4),
                      Wrap(spacing: 10, runSpacing: 3, children: [
                        Text(actor == null || actor.isEmpty ? 'Administrator' : actor,
                            style: theme.textTheme.bodySmall),
                        if (time != null) Text(time, style: theme.textTheme.bodySmall),
                      ]),
                    ]),
                  ),
                  const SizedBox(width: 6),
                  ExcludeSemantics(
                      child: Icon(Icons.chevron_right_rounded, size: 20, color: theme.colorScheme.onSurfaceVariant)),
                ]),
              ),
            ),
          ),
        ),
      ),
    ]);
  }
}
