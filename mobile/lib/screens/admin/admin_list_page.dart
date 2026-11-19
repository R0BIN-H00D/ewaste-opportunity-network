import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/theme/app_colors.dart';
import '../../services/admin_repository.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/menu_section.dart';
import 'admin_catalog.dart';
import 'admin_form.dart';
import 'admin_record_page.dart';
import 'admin_widgets.dart';

class AdminListPage extends ConsumerStatefulWidget {
  const AdminListPage({super.key, required this.section, this.initial = const {}, this.inTab = false});
  final AdminSection section;
  final AdminRecord initial;
  final bool inTab;

  @override
  ConsumerState<AdminListPage> createState() => _AdminListPageState();
}

class _AdminListPageState extends ConsumerState<AdminListPage> {
  late var _filters = Map<String, dynamic>.of(widget.initial)..remove('kind');
  late var _kind =
      monitorKinds.contains(widget.initial['kind']) ? widget.initial['kind'] as String : monitorKinds.first;
  int _page = 1;
  late var _future = _load();
  AdminSection get _section => widget.section;
  AdminRepository get _repo => ref.read(adminRepositoryProvider);

  Future<AdminPageData> _load() => _repo.list(
        _section == AdminSection.monitors ? 'monitors/$_kind' : _section.name,
        query: _filters,
        page: _page,
      );

  void _go(int page) => setState(() {
        _page = page;
        _future = _load();
      });

  Future<void> _filter(AdminPageData data) async {
    final categories = <String, String>{};
    if (_section == AdminSection.listings) {
      try {
        final response = await _repo.list('categories');
        for (final entry in response.items) {
          categories[adminId(entry)] = (entry['name'] ?? 'Category').toString();
        }
      } catch (_) {
        // The other filters still work if the category list is temporarily unavailable.
      }
    }
    final admins = {
      for (final item in adminRecords(data.meta['admins'])) adminId(item): (item['name'] ?? 'Administrator').toString()
    };
    final actions = (data.meta['actions'] as List?)?.whereType<String>().toList() ?? const <String>[];
    final types = (data.meta['targetTypes'] as List?)?.whereType<String>().toList() ?? const <String>[];
    if (!mounted) return;
    final statuses = (data.meta['statuses'] as List?)?.whereType<String>().toList() ?? const <String>[];
    await showAdminForm(
      context,
      title: 'Filter ${_section.title.toLowerCase()}',
      button: 'Show results',
      fields: _section == AdminSection.audit
          ? [
              AdminField('action', 'Action', choices: actions, max: 60),
              AdminField('targetType', 'Target type', choices: types, max: 40),
              AdminField('admin', 'Administrator', choices: admins.keys.toList(), max: 24),
              fromDay,
              toDay,
            ]
          : adminFilters(_section, monitorStatuses: statuses, categories: categories.keys.toList()),
      initial: _filters,
      labels: {...categories, ...admins},
      canReset: true,
      onSubmit: (values) async {
        final query = <String, dynamic>{
          for (final entry in values.entries)
            if (entry.value != '') entry.key: entry.value
        };
        final type = query['type'] ?? 'provider';
        if (_section == AdminSection.verifications && type == 'recipient') query.remove('role');
        _filters = query;
        _go(1);
        return true;
      },
    );
  }

  Future<void> _open(AdminRecord item) async {
    final updated = await Navigator.of(context).push<bool>(MaterialPageRoute(
      builder: (_) => AdminRecordPage(repository: _repo, section: _section, item: item),
    ));
    if (mounted && updated == true) _go(_page);
  }

  Future<void> _add() async {
    if (await editAdminRecord(context, _repo, _section) && mounted) _go(1);
  }

  Future<void> _move(List<AdminRecord> entries, int index, int delta) async {
    final ids = entries.map(adminId).toList();
    ids.insert(index + delta, ids.removeAt(index));
    final changed = await showAdminForm(
      context,
      title: 'Change category order?',
      button: 'Save order',
      fields: const [],
      explanation: 'Move ${entries[index]['name']} ${delta < 0 ? 'up' : 'down'} one place.',
      onSubmit: (_) async {
        await _repo.change('PUT', 'categories/order', {'ids': ids});
        return true;
      },
    );
    if (mounted && changed) _go(1);
  }

  String _subtitle(AdminRecord item) {
    final values = switch (_section) {
      AdminSection.users => [item['email'], adminLabel(item['role'])],
      AdminSection.verifications => [
          item['email'],
          adminLabel(item['type'] == 'recipient' ? 'recipient' : item['role'])
        ],
      AdminSection.monitors => [item['reference'], for (final party in adminRecords(item['parties'])) party['name']],
      AdminSection.listings => [adminRecord(item['owner'])['name'], adminRecord(item['category'])['name']],
      AdminSection.reviews => [item['comment'], adminRecord(item['reviewer'])['name']],
      AdminSection.reports => [adminLabel(item['reason']), adminRecord(item['reporter'])['name'], item['createdAt']],
      AdminSection.complaints => [adminRecord(item['filedBy'])['name'], item['description']],
      AdminSection.categories => [item['group'], item['active'] == true ? 'Active' : 'Inactive'],
      AdminSection.announcements => [item['body']],
      AdminSection.education => [adminLabel(item['topic']), item['summary']],
      AdminSection.audit => [adminRecord(item['admin'])['name'], item['at'] ?? item['createdAt']],
      _ => <Object?>[],
    };
    final status = adminLabel(item['status'] ?? item['state']);
    return [
      if (status.isNotEmpty && _section != AdminSection.reports) status,
      ...values.whereType<Object>().map(adminValue).where((v) => v.isNotEmpty)
    ].join(' · ');
  }

  Widget? _recordTag(AdminRecord item) {
    if (item['targetType'] case final String kind when _section == AdminSection.audit && kind.isNotEmpty) {
      return StatusBadge(adminLabel(kind), tone: BadgeTone.blue);
    }
    if (_section != AdminSection.reports) return null;
    return switch (item['status']) {
      'open' => const StatusBadge('Open', tone: BadgeTone.amber),
      'actioned' => const StatusBadge('Handled', tone: BadgeTone.green),
      'dismissed' => const StatusBadge('Dismissed'),
      _ => null,
    };
  }

  @override
  Widget build(BuildContext context) => AdminScaffold(
        title: _section.title,
        inTab: widget.inTab,
        actions: [
          IconButton(onPressed: () => _go(_page), tooltip: 'Refresh', icon: const Icon(Icons.refresh_rounded)),
          if (_section.canCreate) IconButton(onPressed: _add, tooltip: 'Add', icon: const Icon(Icons.add_rounded)),
        ],
        child: AdminLoad(
          future: _future,
          retry: () => _go(_page),
          builder: (context, data) {
            final pages = (data.meta['pages'] as num?)?.toInt() ?? 1;
            final counts = adminRecord(data.meta['byStatus']);
            return RefreshIndicator(
              onRefresh: () async {
                _go(_page);
                await _future.then<void>((_) {}, onError: (Object _) {});
              },
              child: ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: EdgeInsets.fromLTRB(20, 10, 20, widget.inTab ? 120 : 28),
                children: [
                  if (_section == AdminSection.monitors) ...[
                    DropdownButtonFormField<String>(
                      initialValue: _kind,
                      isExpanded: true,
                      decoration: const InputDecoration(labelText: 'Service'),
                      items: [
                        for (final kind in monitorKinds) DropdownMenuItem(value: kind, child: Text(adminLabel(kind)))
                      ],
                      onChanged: (kind) {
                        if (kind == null || kind == _kind) return;
                        _kind = kind;
                        _filters.remove('status');
                        _go(1);
                      },
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (_section != AdminSection.categories)
                    Align(
                      alignment: Alignment.centerLeft,
                      child: FilledButton.tonalIcon(
                        icon: const Icon(Icons.tune_rounded),
                        label: Text(_filters.isEmpty ? 'Filters' : 'Filters (${_filters.length})'),
                        onPressed: () => _filter(data),
                      ),
                    ),
                  if (counts.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Wrap(spacing: 8, runSpacing: 2, children: [
                      for (final entry in counts.entries)
                        if (entry.value != 0)
                          Text('${adminLabel(entry.key)}: ${entry.value}',
                              style: Theme.of(context).textTheme.labelSmall),
                    ]),
                  ],
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Text('${data.meta['total'] ?? data.items.length} records',
                        style: Theme.of(context).textTheme.labelLarge),
                  ),
                  if (data.items.isEmpty) const AdminPanel(children: [Text('No matching records.')]),
                  for (final (index, item) in data.items.indexed) ...[
                    MenuSection(rows: [
                      MenuRow(
                        icon: _section.icon,
                        accent: AppColors.tileAccents[index % AppColors.tileAccents.length],
                        title: _section == AdminSection.reports
                            ? (adminRecord(item['target'])['title'] ?? adminTitle(_section, item)).toString()
                            : adminTitle(_section, item),
                        subtitle: _subtitle(item),
                        footer: _recordTag(item),
                        onTap: () => _open(item),
                      )
                    ]),
                    if (_section == AdminSection.categories)
                      Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                        IconButton(
                          tooltip: 'Move ${item['name']} up',
                          icon: const Icon(Icons.arrow_upward),
                          onPressed: index > 0 ? () => _move(data.items, index, -1) : null,
                        ),
                        IconButton(
                          tooltip: 'Move ${item['name']} down',
                          icon: const Icon(Icons.arrow_downward),
                          onPressed: index + 1 < data.items.length ? () => _move(data.items, index, 1) : null,
                        ),
                      ]),
                    const SizedBox(height: 8),
                  ],
                  if (_page > 1 || pages > 1)
                    Center(
                        child: Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
                      IconButton(
                          onPressed: _page > 1 ? () => _go(_page - 1) : null,
                          tooltip: 'Previous page',
                          icon: const Icon(Icons.chevron_left)),
                      Text('Page $_page of $pages'),
                      IconButton(
                          onPressed: _page < pages ? () => _go(_page + 1) : null,
                          tooltip: 'Next page',
                          icon: const Icon(Icons.chevron_right)),
                    ])),
                ],
              ),
            );
          },
        ),
      );
}
