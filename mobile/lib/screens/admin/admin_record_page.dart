import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/network/api_exception.dart';
import '../../routes/route_paths.dart';
import '../../services/admin_repository.dart';
import 'admin_actions.dart';
import 'admin_catalog.dart';
import 'admin_files.dart';
import 'admin_form.dart';
import 'admin_widgets.dart';

Future<bool> editAdminRecord(BuildContext context, AdminRepository repository, AdminSection section,
        {AdminRecord? item}) =>
    showAdminForm(
      context,
      title: item == null ? 'Add ${_singular(section)}' : 'Edit ${_singular(section)}',
      button: 'Save',
      fields: adminEditor(section),
      initial: item ?? const {},
      onSubmit: (draft) async {
        final payload = Map<String, dynamic>.of(draft);
        if (section == AdminSection.categories && payload['icon'] == '') payload.remove('icon');
        if (section == AdminSection.categories) payload['hazardous'] ??= false;
        if (section == AdminSection.education) payload['featured'] ??= false;
        if (section == AdminSection.announcements && item != null) payload.putIfAbsent('endsAt', () => null);
        final path = item == null ? section.name : '${section.name}/${Uri.encodeComponent(adminId(item))}';
        await repository.change(item == null ? 'POST' : 'PUT', path, payload);
        return true;
      },
    );

String _singular(AdminSection section) => switch (section) {
      AdminSection.categories => 'category',
      AdminSection.education => 'article',
      _ => 'announcement',
    };

class AdminRecordPage extends StatefulWidget {
  const AdminRecordPage({super.key, required this.repository, required this.section, required this.item});
  final AdminRepository repository;
  final AdminSection section;
  final AdminRecord item;

  @override
  State<AdminRecordPage> createState() => _AdminRecordPageState();
}

class _AdminRecordPageState extends State<AdminRecordPage> {
  late var _record = _load();
  AdminSection get _section => widget.section;

  Future<AdminRecord> _load() async {
    if (!_section.hasServerDetail) return widget.item;
    final id = (_section == AdminSection.verifications ? widget.item['userId'] : adminId(widget.item)).toString();
    return widget.repository.record('${_section.name}/${Uri.encodeComponent(id)}',
        query: {if (_section == AdminSection.verifications) 'type': widget.item['type'] ?? 'provider'});
  }

  void _reload() => setState(() => _record = _load());

  Future<void> _act(AdminAction action, AdminRecord item) async {
    final applied = await showAdminForm(
      context,
      title: '${action.label}?',
      button: action.label,
      fields: [
        if (action.note.isNotEmpty) AdminField(action.noteKey, action.note, lines: 3, min: action.min, max: action.max)
      ],
      danger: action.danger,
      explanation: action.explanation ?? adminTitle(_section, item),
      onSubmit: (values) async {
        final note = values[action.noteKey];
        if (note is String && note.isNotEmpty && note.length < 5 && action.min == 0) {
          throw const ApiException('Optional notes must have at least five characters.');
        }
        await widget.repository.change(action.method, action.path, {
          ...action.body,
          if (note is String && note.isNotEmpty) action.noteKey: note,
          if (_section == AdminSection.announcements && action.label == 'End announcement now')
            'endsAt': DateTime.now().toUtc().toIso8601String(),
        });
        return true;
      },
    );
    if (mounted && applied) Navigator.of(context).pop(true);
  }

  void _open(AdminSection section, AdminRecord record) => Navigator.of(context).push(MaterialPageRoute<void>(
        builder: (_) => AdminRecordPage(repository: widget.repository, section: section, item: record),
      ));

  Widget _link(String title, VoidCallback onPressed) => Align(
        alignment: Alignment.centerLeft,
        child: TextButton.icon(onPressed: onPressed, icon: const Icon(Icons.arrow_forward_rounded), label: Text(title)),
      );

  List<Widget> _links(AdminRecord item) {
    final id = adminId(item);
    final target = adminRecord(item['target']);
    final targetId = adminId(target);
    final auditTarget = (item['targetId'] ?? '').toString();
    final auditType = item['targetType'];
    final recipientStatus = adminRecord(item['organisation'])['recipientStatus'];
    final links = <Widget>[
      if (_section == AdminSection.listings) _link('View listing', () => context.push(Routes.listing(id))),
      if (_section == AdminSection.verifications)
        _link('Open account', () => _open(AdminSection.users, {'_id': item['userId']})),
      if (_section == AdminSection.users &&
          item['verificationStatus'] != null &&
          item['verificationStatus'] != 'not_submitted')
        _link('Open provider submission', () => _open(AdminSection.verifications, {'userId': id, 'type': 'provider'})),
      if (_section == AdminSection.users && recipientStatus != null && recipientStatus != 'not_submitted')
        _link(
            'Open recipient submission', () => _open(AdminSection.verifications, {'userId': id, 'type': 'recipient'})),
      if (_section == AdminSection.complaints)
        for (final key in ['filedBy', 'against', 'assignedTo'])
          if (adminId(adminRecord(item[key])).isNotEmpty)
            _link('Open ${adminRecord(item[key])['name'] ?? adminLabel(key)}',
                () => _open(AdminSection.users, adminRecord(item[key]))),
      if (_section == AdminSection.reports && targetId.isNotEmpty && target['exists'] == true)
        ...switch (target['type']) {
          'user' => [_link('Open account', () => _open(AdminSection.users, target))],
          'listing' => [_link('View listing', () => context.push(Routes.listing(targetId)))],
          'product' => [_link('View product', () => context.push(Routes.product(targetId)))],
          'review' => [_link('See reviews', () => context.push(Routes.adminTool('reviews')))],
          _ => const <Widget>[],
        },
      if (_section == AdminSection.audit && auditTarget.isNotEmpty)
        ...switch (auditType) {
          'User' || 'user' => [
              _link('Open account', () => _open(AdminSection.users, {'_id': auditTarget}))
            ],
          'verification' => [_link('Open verification queue', () => context.push(Routes.adminTool('verifications')))],
          'Complaint' => [
              _link('Open complaint', () => _open(AdminSection.complaints, {'_id': auditTarget}))
            ],
          'DeviceListing' => [_link('View listing', () => context.push(Routes.listing(auditTarget)))],
          'MarketplaceProduct' => [_link('View product', () => context.push(Routes.product(auditTarget)))],
          'Report' => [
              _link('Open report', () => _open(AdminSection.reports, {'_id': auditTarget}))
            ],
          'Review' => [_link('See reviews', () => context.push(Routes.adminTool('reviews')))],
          'Category' => [_link('See categories', () => context.push(Routes.adminTool('categories')))],
          'Announcement' => [_link('See announcements', () => context.push(Routes.adminTool('announcements')))],
          _ => const <Widget>[],
        },
    ];
    return links;
  }

  @override
  Widget build(BuildContext context) => AdminScaffold(
        title: _section.title,
        child: AdminLoad(
          future: _record,
          retry: _reload,
          builder: (context, item) {
            final actions = adminActions(_section, item);
            final docs = adminRecords(item['documents']);
            final history = adminRecords(item['history']);
            final links = _links(item);
            return ListView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 28),
              children: [
                AdminPanel(title: adminTitle(_section, item), children: [
                  AdminFacts(item, omit: const {'title', 'name', 'subject', 'history'}),
                  ...links,
                  if (_section.canCreate || actions.isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      if (_section.canCreate)
                        OutlinedButton.icon(
                          icon: const Icon(Icons.edit_outlined),
                          label: const Text('Edit'),
                          onPressed: () async {
                            final changed = await editAdminRecord(context, widget.repository, _section, item: item);
                            if (changed && context.mounted) Navigator.of(context).pop(true);
                          },
                        ),
                      for (final action in actions)
                        OutlinedButton(
                          style: action.danger
                              ? OutlinedButton.styleFrom(foregroundColor: Theme.of(context).colorScheme.error)
                              : null,
                          onPressed: () => _act(action, item),
                          child: Text(action.label),
                        ),
                    ]),
                  ],
                ]),
                if (_section == AdminSection.verifications && item['type'] == 'provider') ...[
                  const SizedBox(height: 12),
                  AdminPanel(title: 'Documents', children: [
                    if (docs.isEmpty) const Text('No documents submitted.'),
                    for (final doc in docs)
                      if (doc['viewUrl'] case final String url)
                        _link('View ${adminLabel(doc['docType']).toLowerCase()}', () {
                          Navigator.of(context).push(MaterialPageRoute<void>(
                            builder: (_) => AdminDocumentPage(repository: widget.repository, url: url),
                          ));
                        }),
                  ]),
                ],
                if (history.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  AdminPanel(title: 'History', children: [
                    for (final entry in _section == AdminSection.complaints ? history.reversed : history) ...[
                      AdminFacts(entry),
                      const Divider(height: 12),
                    ],
                  ]),
                ],
              ],
            );
          },
        ),
      );
}
