import 'package:material_ui/material_ui.dart';
import '../../core/network/api_exception.dart';
import '../../services/admin_repository.dart';
import '../learn/markdown_view.dart';
import 'admin_catalog.dart';

Future<bool> showAdminForm(
  BuildContext context, {
  required String title,
  required String button,
  required List<AdminField> fields,
  required Future<bool> Function(AdminRecord) onSubmit,
  AdminRecord initial = const {},
  Map<String, String> labels = const {},
  bool canReset = false,
  bool danger = false,
  String? explanation,
}) async =>
    await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _AdminForm(
          title: title,
          button: button,
          fields: fields,
          initial: initial,
          labels: labels,
          onSubmit: onSubmit,
          canReset: canReset,
          danger: danger,
          explanation: explanation),
    ) ??
    false;

class _AdminForm extends StatefulWidget {
  const _AdminForm(
      {required this.title,
      required this.button,
      required this.fields,
      required this.initial,
      required this.labels,
      required this.onSubmit,
      required this.canReset,
      required this.danger,
      this.explanation});
  final String title;
  final String button;
  final List<AdminField> fields;
  final AdminRecord initial;
  final Map<String, String> labels;
  final Future<bool> Function(AdminRecord) onSubmit;
  final bool canReset;
  final bool danger;
  final String? explanation;

  @override
  State<_AdminForm> createState() => _AdminFormState();
}

class _AdminFormState extends State<_AdminForm> {
  late final _values = <String, dynamic>{
    for (final field in widget.fields) field.key: widget.initial[field.key] ?? field.initial
  };
  final _form = GlobalKey<FormState>();
  Map<String, String> _fieldErrors = {};
  String? _error;
  bool _saving = false;
  bool _preview = false;
  int _revision = 0;

  String _label(String value) => widget.labels[value] ?? (value == 'true' ? 'Reported only' : adminLabel(value));

  void _set(String key, Object? value) => setState(() {
        _values[key] = value;
        _fieldErrors.remove(key);
        _error = null;
      });

  Future<void> _save() async {
    if (_saving || !_form.currentState!.validate()) return;
    final values = <String, dynamic>{
      for (final entry in _values.entries)
        if (entry.value != null) entry.key: entry.value is String ? (entry.value as String).trim() : entry.value,
    };
    final from = values['from'] as String?;
    final to = values['to'] as String?;
    final starts = DateTime.tryParse((values['startsAt'] ?? '').toString());
    final ends = DateTime.tryParse((values['endsAt'] ?? '').toString());
    if ((from != null && to != null && to.compareTo(from) < 0) ||
        (starts != null && ends != null && ends.isBefore(starts))) {
      setState(() => _error = 'Choose an end date on or after the start date.');
      return;
    }
    setState(() {
      _saving = true;
      _error = null;
      _fieldErrors = {};
    });
    try {
      final accepted = await widget.onSubmit(values);
      if (mounted && accepted) Navigator.of(context).pop(true);
    } catch (error) {
      if (mounted) {
        final api = ApiException.from(error);
        setState(() {
          _error = api.message;
          _fieldErrors = Map.of(api.fieldErrors);
        });
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _pickDate(AdminField field) async {
    final initial = DateTime.tryParse((_values[field.key] ?? '').toString())?.toLocal() ?? DateTime.now();
    final day = await showDatePicker(
        context: context,
        firstDate: DateTime(2000),
        lastDate: DateTime(2100),
        initialDate: initial.isBefore(DateTime(2000)) || initial.isAfter(DateTime(2100)) ? DateTime.now() : initial);
    if (!mounted || day == null) return;
    if (!field.dateTime) {
      _set(field.key, day.toIso8601String().split('T').first);
      return;
    }
    final time = await showTimePicker(context: context, initialTime: TimeOfDay.fromDateTime(initial));
    if (mounted && time != null) {
      _set(field.key, DateTime(day.year, day.month, day.day, time.hour, time.minute).toUtc().toIso8601String());
    }
  }

  Widget _field(AdminField field) {
    final value = _values[field.key];
    final errors = _fieldErrors[field.key] ?? _fieldErrors['query.${field.key}'];
    final readOnly = _saving;
    if (field.toggle) {
      return SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: Text(field.label),
          value: value == true,
          onChanged: readOnly ? null : (checked) => _set(field.key, checked));
    }
    if (field.date || field.dateTime) {
      final date = DateTime.tryParse((value ?? '').toString())?.toLocal();
      final dates = MaterialLocalizations.of(context);
      final display = date == null ? 'Choose date' : dates.formatMediumDate(date);
      return InputDecorator(
        decoration: InputDecoration(labelText: field.label, errorText: errors),
        child: Row(
          children: [
            Expanded(
                child: TextButton(
              onPressed: readOnly ? null : () => _pickDate(field),
              child: Text(field.dateTime && date != null
                  ? '$display ${dates.formatTimeOfDay(TimeOfDay.fromDateTime(date))}'
                  : display),
            )),
            if (date != null)
              IconButton(
                  onPressed: readOnly ? null : () => _set(field.key, null),
                  tooltip: 'Clear ${field.label.toLowerCase()}',
                  icon: const Icon(Icons.close_rounded)),
          ],
        ),
      );
    }
    if (field.multi) {
      final selected = value is List ? value.whereType<String>().toList() : <String>[];
      return FormField<void>(
        validator: (_) => selected.isEmpty ? 'Choose at least one audience.' : null,
        builder: (state) => InputDecorator(
          decoration: InputDecoration(labelText: field.label, errorText: errors ?? state.errorText),
          child: Wrap(spacing: 8, children: [
            for (final choice in field.choices)
              FilterChip(
                label: Text(choice == 'all' ? 'Everyone' : _label(choice)),
                selected: selected.contains(choice),
                onSelected: readOnly
                    ? null
                    : (checked) {
                        final next = selected
                            .where((current) => current != choice && (choice == 'all' ? !checked : current != 'all'))
                            .toList();
                        _set(field.key, [...next, if (checked) choice]);
                      },
              ),
          ]),
        ),
      );
    }
    if (field.choices.isNotEmpty) {
      return DropdownButtonFormField<String>(
        key: ValueKey((field.key, _revision)),
        initialValue: field.choices.contains(value) ? value as String : (field.min == 0 ? '' : null),
        isExpanded: true,
        decoration: InputDecoration(labelText: field.label, errorText: errors),
        items: [
          if (field.min == 0) const DropdownMenuItem(value: '', child: Text('Default')),
          for (final choice in field.choices)
            DropdownMenuItem(value: choice, child: Text(_label(choice), overflow: TextOverflow.ellipsis)),
        ],
        onChanged: readOnly ? null : (choice) => _set(field.key, choice),
        validator: (choice) => field.min > 0 && (choice == null || choice.isEmpty) ? 'Choose an option.' : null,
      );
    }
    return TextFormField(
      key: ValueKey((field.key, _revision)),
      enabled: !readOnly,
      initialValue: value?.toString() ?? '',
      minLines: field.lines,
      maxLines: field.lines + (field.lines > 1 ? 3 : 0),
      maxLength: field.max,
      decoration: InputDecoration(labelText: field.label, errorText: errors),
      onChanged: (text) => _set(field.key, text),
      validator: (text) {
        final size = (text ?? '').trim().length;
        if (size < field.min) {
          return field.min == 1 ? 'This field is required.' : 'Enter at least ${field.min} characters.';
        }
        if (field.key == 'icon' && size > 0 && !RegExp(r'^[a-z0-9-]+$').hasMatch(text!.trim())) {
          return 'Use a Lucide icon name such as laptop.';
        }
        return null;
      },
    );
  }

  @override
  Widget build(BuildContext context) => PopScope(
        canPop: !_saving,
        child: AlertDialog(
          scrollable: true,
          title: Text(widget.title),
          content: SizedBox(
            width: 460,
            child: Form(
              key: _form,
              child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                if (widget.explanation != null) Text(widget.explanation!),
                for (final field in widget.fields)
                  Padding(padding: const EdgeInsets.only(top: 12), child: _field(field)),
                if (widget.fields.any((field) => field.label.contains('Markdown'))) ...[
                  TextButton(
                      onPressed: () => setState(() => _preview = !_preview),
                      child: Text(_preview ? 'Hide preview' : 'Preview article')),
                  if (_preview) MarkdownView(source: (_values['body'] ?? '').toString()),
                ],
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 12),
                    child: Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
                  ),
              ]),
            ),
          ),
          actions: [
            TextButton(onPressed: _saving ? null : () => Navigator.of(context).pop(), child: const Text('Cancel')),
            if (widget.canReset)
              TextButton(
                onPressed: _saving
                    ? null
                    : () => setState(() {
                          _values.clear();
                          _fieldErrors = {};
                          _error = null;
                          _revision++;
                        }),
                child: const Text('Reset'),
              ),
            FilledButton(
              style:
                  widget.danger ? FilledButton.styleFrom(backgroundColor: Theme.of(context).colorScheme.error) : null,
              onPressed: _saving ? null : _save,
              child: Text(_saving ? 'Working…' : widget.button),
            ),
          ],
        ),
      );
}
