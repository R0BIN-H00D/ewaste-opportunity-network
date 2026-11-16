import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/recycling_validation.dart';
import '../../models/recycling.dart';

/// What the centre typed in the materials sheet.
class MaterialsAnswer {
  const MaterialsAnswer(this.materials, this.reportNotes);

  final List<RecoveredMaterial> materials;
  final String reportNotes;
}

/// The recovered-materials form: a measured and an estimated weight for each material, kept apart (BR-06). Rows left empty are skipped.
/// `null` if the centre backs out.
Future<MaterialsAnswer?> askMaterials(BuildContext context, {List<RecoveredMaterial> current = const [], String? reportNotes}) {
  return showModalBottomSheet<MaterialsAnswer>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _MaterialsSheet(current: current, reportNotes: reportNotes),
  );
}

String _initial(double? kg) => kg == null ? '' : (kg == kg.roundToDouble() ? kg.round().toString() : kg.toString());

class _MaterialsSheet extends StatefulWidget {
  const _MaterialsSheet({required this.current, this.reportNotes});

  final List<RecoveredMaterial> current;
  final String? reportNotes;

  @override
  State<_MaterialsSheet> createState() => _MaterialsSheetState();
}

class _MaterialsSheetState extends State<_MaterialsSheet> {
  late final Map<String, TextEditingController> _actual;
  late final Map<String, TextEditingController> _estimated;
  late final TextEditingController _notes;
  String? _error;
  final _formKey = GlobalKey<FormState>();

  @override
  void initState() {
    super.initState();
    final byType = {for (final m in widget.current) m.type: m};
    _actual = {for (final (type, _) in materialTypes) type: TextEditingController(text: _initial(byType[type]?.actualKg))};
    _estimated = {for (final (type, _) in materialTypes) type: TextEditingController(text: _initial(byType[type]?.estimatedKg))};
    _notes = TextEditingController(text: widget.reportNotes ?? '');
  }

  @override
  void dispose() {
    for (final c in [..._actual.values, ..._estimated.values, _notes]) {
      c.dispose();
    }
    super.dispose();
  }

  void _save() {
    if (!_formKey.currentState!.validate()) return;
    final rows = <RecoveredMaterial>[
      for (final (type, _) in materialTypes)
        if (parseKg(_actual[type]!.text) != null || parseKg(_estimated[type]!.text) != null)
          RecoveredMaterial(type: type, actualKg: parseKg(_actual[type]!.text), estimatedKg: parseKg(_estimated[type]!.text)),
    ];
    if (rows.isEmpty) {
      setState(() => _error = 'Add a weight for at least one material.');
      return;
    }
    Navigator.pop(context, MaterialsAnswer(rows, _notes.text.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('What was recovered?', style: theme.textTheme.titleLarge),
              const SizedBox(height: 4),
              Text('Enter what you weighed as "Measured". Use "Estimated" only for a guess. They are always kept apart.', style: theme.textTheme.bodyMedium),
              const SizedBox(height: 12),
              for (final (type, label) in materialTypes)
                Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Expanded(
                        child: TextFormField(
                          controller: _actual[type],
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          validator: validateKg,
                          decoration: InputDecoration(labelText: '$label measured (kg)'),
                        ),
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: TextFormField(
                          controller: _estimated[type],
                          keyboardType: const TextInputType.numberWithOptions(decimal: true),
                          validator: validateKg,
                          decoration: InputDecoration(labelText: '$label estimated (kg)'),
                        ),
                      ),
                    ],
                  ),
                ),
              TextFormField(controller: _notes, maxLines: 3, maxLength: 2000, decoration: const InputDecoration(labelText: 'Report notes (optional)')),
              if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(_error!, style: TextStyle(color: theme.colorScheme.error))),
              const SizedBox(height: 8),
              FilledButton(onPressed: _save, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), child: const Text('Save materials')),
            ],
          ),
        ),
      ),
    );
  }
}
