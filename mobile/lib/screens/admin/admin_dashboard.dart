import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/theme/app_colors.dart';
import '../../routes/route_paths.dart';
import '../../services/admin_repository.dart';
import '../../widgets/menu_section.dart';
import 'admin_catalog.dart';
import 'admin_record_page.dart';
import 'admin_widgets.dart';

class AdminDashboard extends ConsumerStatefulWidget {
  const AdminDashboard({super.key});

  @override
  ConsumerState<AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends ConsumerState<AdminDashboard> {
  late var _overview = _load();
  AdminRepository get _repo => ref.read(adminRepositoryProvider);
  Future<AdminRecord> _load() => _repo.record('dashboard');
  void _reload() => setState(() => _overview = _load());

  void _open(AdminSection section, [Map<String, String> query = const {}]) =>
      context.push(Uri(path: Routes.adminTool(section.name), queryParameters: query.isEmpty ? null : query).toString());

  Widget _tools() => MenuSection(rows: [
        for (final (index, section) in AdminSection.values.indexed)
          MenuRow(
              icon: section.icon,
              accent: AppColors.tileAccents[index % AppColors.tileAccents.length],
              title: section.title,
              subtitle: section.description,
              onTap: () => _open(section)),
      ]);

  Widget _attention(AdminRecord data) {
    final pending = adminRecord(data['pendingVerifications']);
    return MenuSection(caption: 'Needs attention', rows: [
      MenuRow(
          icon: Icons.verified_user_outlined,
          accent: AppColors.tileAccents[2],
          title: '${pending['total'] ?? 0} pending verifications',
          subtitle: '${pending['providers'] ?? 0} providers · ${pending['recipients'] ?? 0} recipient organisations',
          onTap: () => _open(AdminSection.verifications)),
      MenuRow(
          icon: Icons.flag_outlined,
          accent: AppColors.tileAccents[3],
          title: '${data['openReports'] ?? 0} open reports',
          subtitle: 'Review reported content and accounts',
          onTap: () => _open(AdminSection.reports, {'status': 'open'})),
      MenuRow(
          icon: Icons.assignment_outlined,
          accent: AppColors.tileAccents[1],
          title: '${data['openComplaints'] ?? 0} active complaints',
          subtitle: 'Review outstanding cases',
          onTap: () => _open(AdminSection.complaints, {'status': 'active'})),
    ]);
  }

  @override
  Widget build(BuildContext context) => AdminScaffold(
        title: 'Administration',
        actions: [IconButton(onPressed: _reload, tooltip: 'Refresh overview', icon: const Icon(Icons.refresh_rounded))],
        child: FutureBuilder<AdminRecord>(
          future: _overview,
          builder: (context, snapshot) {
            final data = snapshot.data;
            final activity = adminRecords(data?['recentActivity']);
            return RefreshIndicator(
              onRefresh: () async {
                _reload();
                await _overview.then<void>((_) {}, onError: (Object _) {});
              },
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
                children: [
                  if (snapshot.connectionState != ConnectionState.done) const LinearProgressIndicator(),
                  if (snapshot.hasError)
                    AdminPanel(children: [
                      const Text('Could not refresh the overview.'),
                      TextButton(onPressed: _reload, child: const Text('Try again')),
                    ]),
                  if (data != null) ...[_attention(adminRecord(data['attention'])), const SizedBox(height: 20)],
                  _tools(),
                  if (data != null) ...[
                    for (final key in ['people', 'centres', 'listings', 'services', 'marketplace']) ...[
                      const SizedBox(height: 12),
                      AdminPanel(title: adminLabel(key), children: [AdminFacts(adminRecord(data[key]))]),
                    ],
                    if (activity.isNotEmpty) ...[
                      const SizedBox(height: 12),
                      MenuSection(caption: 'Recent activity', rows: [
                        for (final entry in activity)
                          MenuRow(
                              icon: Icons.history_rounded,
                              accent: AppColors.tileAccents[1],
                              title: adminLabel(entry['action']),
                              subtitle: [adminRecord(entry['admin'])['name'], entry['at']]
                                  .whereType<Object>()
                                  .map(adminValue)
                                  .join(' · '),
                              onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
                                    builder: (_) =>
                                        AdminRecordPage(repository: _repo, section: AdminSection.audit, item: entry),
                                  ))),
                      ]),
                    ],
                  ],
                ],
              ),
            );
          },
        ),
      );
}
