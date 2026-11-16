import 'package:material_ui/material_ui.dart';
import '../../core/learning_validation.dart';

/// The note a student sends with an application. Optional. Returns the text (possibly empty), or `null` if they back out.
Future<String?> askApplication(BuildContext context, {required String title}) {
  return showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _ApplySheet(title: title),
  );
}

class _ApplySheet extends StatefulWidget {
  const _ApplySheet({required this.title});

  final String title;

  @override
  State<_ApplySheet> createState() => _ApplySheetState();
}

class _ApplySheetState extends State<_ApplySheet> {
  final _formKey = GlobalKey<FormState>();
  final _message = TextEditingController();

  @override
  void dispose() {
    _message.dispose();
    super.dispose();
  }

  void _send() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.pop(context, _message.text.trim());
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
              Text('Apply for this task', style: theme.textTheme.titleLarge),
              Text(widget.title, style: theme.textTheme.bodyMedium),
              const SizedBox(height: 12),
              TextFormField(
                controller: _message,
                validator: validateApplicationMessage,
                maxLines: 4,
                maxLength: 500,
                decoration: const InputDecoration(labelText: 'Why do you want to do this? (optional)'),
              ),
              const SizedBox(height: 8),
              FilledButton(onPressed: _send, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), child: const Text('Send application')),
            ],
          ),
        ),
      ),
    );
  }
}

/// What a supervisor typed when finishing a task.
class CompletionInput {
  const CompletionInput({required this.hours, this.feedback = ''});

  final double hours;
  final String feedback;
}

/// Asks how many hours the student worked and for an optional word of feedback. `null` if they back out.
Future<CompletionInput?> askCompletion(BuildContext context, {required String studentName}) {
  return showModalBottomSheet<CompletionInput>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _CompletionSheet(studentName: studentName),
  );
}

class _CompletionSheet extends StatefulWidget {
  const _CompletionSheet({required this.studentName});

  final String studentName;

  @override
  State<_CompletionSheet> createState() => _CompletionSheetState();
}

class _CompletionSheetState extends State<_CompletionSheet> {
  final _formKey = GlobalKey<FormState>();
  final _hours = TextEditingController();
  final _feedback = TextEditingController();

  @override
  void dispose() {
    _hours.dispose();
    _feedback.dispose();
    super.dispose();
  }

  void _send() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.pop(context, CompletionInput(hours: double.parse(_hours.text.trim()), feedback: _feedback.text.trim()));
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
              Text('Finish the task', style: theme.textTheme.titleLarge),
              Text(widget.studentName, style: theme.textTheme.bodyMedium),
              const SizedBox(height: 12),
              TextFormField(
                controller: _hours,
                validator: validateHoursWorked,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Hours worked', helperText: 'These count towards the student\'s certificate.'),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _feedback,
                validator: validateFeedback,
                maxLines: 3,
                maxLength: 1000,
                decoration: const InputDecoration(labelText: 'Feedback for the student (optional)'),
              ),
              const SizedBox(height: 8),
              FilledButton(onPressed: _send, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), child: const Text('Finish task')),
            ],
          ),
        ),
      ),
    );
  }
}
