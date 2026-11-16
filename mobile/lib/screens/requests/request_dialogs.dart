import 'package:material_ui/material_ui.dart';
import '../../core/request_validation.dart';

/// A yes/no question. Returns `true` only when the person confirms.
Future<bool> askConfirm(BuildContext context, {required String title, required String message, required String confirmLabel, String cancelLabel = 'Not now'}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (ctx) => AlertDialog(
      title: Text(title),
      content: Text(message),
      actions: [
        TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text(cancelLabel)),
        FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(confirmLabel)),
      ],
    ),
  );
  return result ?? false;
}

/// What the person typed when declining a quote or cancelling.
class ReasonAnswer {
  const ReasonAnswer(this.reason, {this.cancelRequest = false});

  final String reason;
  final bool cancelRequest;
}

/// Asks for a reason. [required] makes it compulsory (declining a quote needs one); [offerCancel] adds a tick box to end
/// the request instead of asking the technician for a new quote.
Future<ReasonAnswer?> askReason(
  BuildContext context, {
  required String title,
  required String confirmLabel,
  String? message,
  bool required = false,
  bool offerCancel = false,
}) {
  return showDialog<ReasonAnswer>(
    context: context,
    builder: (ctx) => _ReasonDialog(title: title, message: message, confirmLabel: confirmLabel, required: required, offerCancel: offerCancel),
  );
}

class _ReasonDialog extends StatefulWidget {
  const _ReasonDialog({required this.title, required this.message, required this.confirmLabel, required this.required, required this.offerCancel});

  final String title;
  final String? message;
  final String confirmLabel;
  final bool required;
  final bool offerCancel;

  @override
  State<_ReasonDialog> createState() => _ReasonDialogState();
}

class _ReasonDialogState extends State<_ReasonDialog> {
  final _controller = TextEditingController();
  bool _cancel = false;
  String? _error;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _submit() {
    if (widget.required) {
      final problem = validateDeclineReason(_controller.text);
      if (problem != null) {
        setState(() => _error = problem);
        return;
      }
    }
    Navigator.pop(context, ReasonAnswer(_controller.text.trim(), cancelRequest: _cancel));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (widget.message != null) ...[Text(widget.message!), const SizedBox(height: 12)],
            TextField(
              controller: _controller,
              maxLines: 3,
              maxLength: 500,
              decoration: InputDecoration(labelText: widget.required ? 'Reason' : 'Reason (optional)', errorText: _error),
              onChanged: (_) {
                if (_error != null) setState(() => _error = null);
              },
            ),
            if (widget.offerCancel)
              CheckboxListTile(
                contentPadding: EdgeInsets.zero,
                controlAffinity: ListTileControlAffinity.leading,
                value: _cancel,
                onChanged: (v) => setState(() => _cancel = v ?? false),
                title: const Text('Cancel the request instead of asking for a new quote'),
              ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Back')),
        FilledButton(onPressed: _submit, child: Text(widget.confirmLabel)),
      ],
    );
  }
}

/// The data-protection checklist the owner must accept before handing a device over (BR-12). `true` when they accept.
Future<bool> askHandoverChecklist(BuildContext context) async {
  final result = await showDialog<bool>(context: context, builder: (ctx) => const _ChecklistDialog());
  return result ?? false;
}

class _ChecklistDialog extends StatefulWidget {
  const _ChecklistDialog();

  @override
  State<_ChecklistDialog> createState() => _ChecklistDialogState();
}

class _ChecklistDialogState extends State<_ChecklistDialog> {
  bool _ok = false;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Before you hand it over'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('Protect your data first:'),
          const SizedBox(height: 8),
          const Text('•  Back up anything you want to keep.'),
          const Text('•  Sign out of your accounts and remove screen locks.'),
          const Text('•  Take out SIM and memory cards.'),
          const Text('•  Reset the device if it still turns on.'),
          const SizedBox(height: 8),
          CheckboxListTile(
            contentPadding: EdgeInsets.zero,
            controlAffinity: ListTileControlAffinity.leading,
            value: _ok,
            onChanged: (v) => setState(() => _ok = v ?? false),
            title: const Text('I have done this'),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Not yet')),
        FilledButton(onPressed: _ok ? () => Navigator.pop(context, true) : null, child: const Text('Confirm handover')),
      ],
    );
  }
}

/// Date, then time, for a pickup. `null` if the person backs out of either step.
Future<DateTime?> pickPickupTime(BuildContext context) async {
  final now = DateTime.now();
  final date = await showDatePicker(
    context: context,
    initialDate: now.add(const Duration(days: 1)),
    firstDate: now,
    lastDate: now.add(const Duration(days: 60)),
    helpText: 'Pickup date',
  );
  if (date == null || !context.mounted) return null;
  final time = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 11, minute: 0), helpText: 'Pickup time');
  if (time == null) return null;
  return DateTime(date.year, date.month, date.day, time.hour, time.minute);
}
