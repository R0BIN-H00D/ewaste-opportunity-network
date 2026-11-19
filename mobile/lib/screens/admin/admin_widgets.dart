import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../services/admin_repository.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/state_views.dart';
import 'admin_catalog.dart';

class AdminScaffold extends StatelessWidget {
  const AdminScaffold(
      {super.key, required this.title, required this.child, this.actions = const [], this.inTab = false});
  final String title;
  final Widget child;
  final List<Widget> actions;
  final bool inTab;

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: inTab ? Colors.transparent : null,
        appBar: glassAppBar(context, title, actions: actions, automaticallyImplyLeading: !inTab),
        body: inTab ? child : AppBackground(child: SafeArea(top: false, child: child)),
      );
}

class AdminPanel extends StatelessWidget {
  const AdminPanel({super.key, this.title, required this.children});
  final String? title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) => GlassContainer(
        radius: 22,
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (title case final label?) ...[
              Semantics(header: true, child: Text(label, style: Theme.of(context).textTheme.titleMedium)),
              const SizedBox(height: 10),
            ],
            ...children,
          ],
        ),
      );
}

class AdminLoad<T> extends StatelessWidget {
  const AdminLoad({super.key, required this.future, required this.retry, required this.builder});
  final Future<T> future;
  final VoidCallback retry;
  final Widget Function(BuildContext, T) builder;

  @override
  Widget build(BuildContext context) => FutureBuilder<T>(
        future: future,
        builder: (context, snapshot) {
          if (snapshot.connectionState != ConnectionState.done) return const Center(child: CircularProgressIndicator());
          if (snapshot.hasError) {
            return SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: ErrorState(error: ApiException.from(snapshot.error!), onRetry: retry),
            );
          }
          return builder(context, snapshot.data as T);
        },
      );
}

String adminValue(Object value) {
  if (value is bool) return value ? 'Yes' : 'No';
  if (value is num) return value.toString();
  final text = value.toString();
  if (RegExp(r'^\d{4}-\d{2}-\d{2}T').hasMatch(text)) {
    final date = DateTime.tryParse(text);
    if (date != null) return formatDateTime(date.toLocal());
  }
  return text;
}

class AdminFacts extends StatelessWidget {
  const AdminFacts(this.data, {super.key, this.omit = const {}});
  final AdminRecord data;
  final Set<String> omit;
  static const _internal = {'_id', '__v', 'actions', 'viewUrl', 'documents', 'file', 'storageKey', 'url'};
  static const _statuses = {
    'status',
    'state',
    'role',
    'type',
    'action',
    'targetType',
    'topic',
    'verificationStatus',
    'recipientStatus'
  };

  bool _visible(MapEntry<String, dynamic> entry) {
    final value = entry.value;
    return !_internal.contains(entry.key) &&
        !omit.contains(entry.key) &&
        value != null &&
        value != '' &&
        (value is! Map || value.isNotEmpty) &&
        (value is! List || value.isNotEmpty);
  }

  Widget _field(BuildContext context, String key, Object value) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(adminLabel(key), style: theme.textTheme.labelMedium),
        if (value is Map)
          Padding(padding: const EdgeInsets.only(left: 12, top: 4), child: AdminFacts(adminRecord(value)))
        else if (value is List && value.any((entry) => entry is Map))
          for (final record in adminRecords(value))
            Padding(
              padding: const EdgeInsets.only(left: 12, top: 6),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                AdminFacts(record),
                const Divider(height: 10),
              ]),
            )
        else
          SelectableText(
            value is List
                ? value.whereType<Object>().map(adminValue).join(' · ')
                : (_statuses.contains(key) ? adminLabel(value) : adminValue(value)),
            style: theme.textTheme.bodyMedium,
          ),
      ]),
    );
  }

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [for (final entry in data.entries.where(_visible)) _field(context, entry.key, entry.value as Object)],
      );
}
