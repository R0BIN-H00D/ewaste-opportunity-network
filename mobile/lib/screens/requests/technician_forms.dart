import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../services/photo_picker.dart';
import '../../services/request_repository.dart';
import '../../widgets/photo_attachments.dart';

/// Shows [builder] as a scrollable bottom sheet that rises above the keyboard.
Future<T?> _sheet<T>(BuildContext context, WidgetBuilder builder) => showModalBottomSheet<T>(context: context, isScrollControlled: true, showDragHandle: true, builder: builder);

Widget _padded(BuildContext context, List<Widget> children) => Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: children)),
    );

/* ---------- the quote ---------- */

/// The money must be a number from 0 to 1 crore, as the server checks.
String? validateMoney(String? value, {String empty = 'Enter an amount'}) {
  final text = (value ?? '').trim();
  if (text.isEmpty) return empty;
  final n = double.tryParse(text);
  if (n == null || n < 0) return 'Enter an amount of 0 or more';
  if (n > 10000000) return 'That is more than the app accepts';
  return null;
}

/// Whole days, 0 to 365 (how long the repair takes). Empty is fine.
String? validateDays(String? value) {
  final text = (value ?? '').trim();
  if (text.isEmpty) return null;
  final n = int.tryParse(text);
  return n == null || n < 0 || n > 365 ? 'Enter whole days, between 0 and 365' : null;
}

/// How long the offer stays open, 1 to 90 days.
String? validateOfferDays(String? value) {
  final n = int.tryParse((value ?? '').trim());
  return n == null || n < 1 || n > 90 ? 'Between 1 and 90 days' : null;
}

/// The quote form. `null` if the technician backs out. [revising] warns that sending pauses the repair.
Future<QuotationInput?> askQuote(BuildContext context, {bool revising = false}) => _sheet(context, (_) => _QuoteSheet(revising: revising));

class _Line {
  final label = TextEditingController();
  final amount = TextEditingController();

  void dispose() {
    label.dispose();
    amount.dispose();
  }
}

class _QuoteSheet extends StatefulWidget {
  const _QuoteSheet({required this.revising});

  final bool revising;

  @override
  State<_QuoteSheet> createState() => _QuoteSheetState();
}

class _QuoteSheetState extends State<_QuoteSheet> {
  final _form = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _days = TextEditingController();
  final _valid = TextEditingController(text: '7');
  final _notes = TextEditingController();
  final _lines = <_Line>[];
  String? _mismatch;

  @override
  void dispose() {
    for (final c in [_amount, _days, _valid, _notes]) {
      c.dispose();
    }
    for (final l in _lines) {
      l.dispose();
    }
    super.dispose();
  }

  double get _lineTotal => _lines.fold(0, (sum, l) => sum + (double.tryParse(l.amount.text.trim()) ?? 0));

  void _submit() {
    final valid = _form.currentState!.validate();
    final total = double.tryParse(_amount.text.trim());
    final mismatch = valid && _lines.isNotEmpty && total != null && (_lineTotal - total).abs() > 0.01 ? 'The total must equal the lines (${formatPrice(_lineTotal)}).' : null;
    setState(() => _mismatch = mismatch);
    if (!valid || mismatch != null) return;
    Navigator.pop(
      context,
      QuotationInput(
        amount: total!,
        lines: [for (final l in _lines) (label: l.label.text.trim(), amount: double.parse(l.amount.text.trim()))],
        etaDays: _days.text.trim().isEmpty ? null : int.parse(_days.text.trim()),
        validDays: int.parse(_valid.text.trim()),
        notes: _notes.text,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const money = TextInputType.numberWithOptions(decimal: true);
    return _padded(context, [
      Text(widget.revising ? 'Send a revised quote' : 'Send your quote', style: theme.textTheme.titleLarge),
      const SizedBox(height: 4),
      Text(widget.revising ? 'Sending a revised quote pauses the repair until the owner approves it again.' : 'Nothing starts until the owner approves it. They pay you directly.', style: theme.textTheme.bodyMedium),
      const SizedBox(height: 12),
      Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            TextFormField(
              controller: _amount,
              keyboardType: money,
              decoration: InputDecoration(labelText: 'Total charge (₹)', errorText: _mismatch),
              validator: validateMoney,
              onChanged: (_) {
                if (_mismatch != null) setState(() => _mismatch = null);
              },
            ),
            const SizedBox(height: 12),
            Text('Breakdown (optional)', style: theme.textTheme.titleSmall),
            for (var i = 0; i < _lines.length; i++)
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: _lines[i].label,
                        maxLength: 80,
                        decoration: InputDecoration(labelText: 'Line ${i + 1}', counterText: ''),
                        validator: (v) => (v ?? '').trim().isEmpty ? 'Name this line' : null,
                      ),
                    ),
                    const SizedBox(width: 8),
                    SizedBox(
                      width: 96,
                      child: TextFormField(
                        controller: _lines[i].amount,
                        keyboardType: money,
                        decoration: const InputDecoration(labelText: '₹'),
                        validator: (v) => validateMoney(v, empty: 'Amount'),
                      ),
                    ),
                    IconButton(
                      tooltip: 'Remove line ${i + 1}',
                      constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () => setState(() => _lines.removeAt(i).dispose()),
                    ),
                  ],
                ),
              ),
            if (_lines.length < 20)
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(onPressed: () => setState(() => _lines.add(_Line())), icon: const Icon(Icons.add), label: const Text('Add a line')),
              ),
            const SizedBox(height: 4),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _days,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: const InputDecoration(labelText: 'Days needed'), // the field is half-width, so a longer label is cut off
                    validator: validateDays,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _valid,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: const InputDecoration(labelText: 'Offer valid (days)'),
                    validator: validateOfferDays,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(controller: _notes, maxLines: 3, maxLength: 1000, decoration: const InputDecoration(labelText: 'Notes for the owner (optional)')),
            const SizedBox(height: 8),
            SizedBox(width: double.infinity, child: FilledButton(onPressed: _submit, child: const Text('Send quote'))),
          ],
        ),
      ),
    ]);
  }
}

/* ---------- an update, or the finished repair ---------- */

/// What the technician wrote and attached.
class UpdateInput {
  const UpdateInput({this.note = '', this.photos = const []});

  final String note;
  final List<PickedPhoto> photos;
}

/// The update form. With [completing] it marks the repair done, which needs at least one photo of the repaired device;
/// otherwise a note or a photo is enough. `null` if the technician backs out.
Future<UpdateInput?> askUpdate(BuildContext context, {bool completing = false}) => _sheet(context, (_) => _UpdateSheet(completing: completing));

class _UpdateSheet extends StatefulWidget {
  const _UpdateSheet({required this.completing});

  final bool completing;

  @override
  State<_UpdateSheet> createState() => _UpdateSheetState();
}

class _UpdateSheetState extends State<_UpdateSheet> {
  final _note = TextEditingController();
  List<PickedPhoto> _photos = const [];
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  void _submit() {
    final problem = widget.completing
        ? (_photos.isEmpty ? 'Add at least one photo of the repaired device.' : null)
        : (_note.text.trim().isEmpty && _photos.isEmpty ? 'Add a note or at least one photo.' : null);
    setState(() => _error = problem);
    if (problem != null) return;
    Navigator.pop(context, UpdateInput(note: _note.text.trim(), photos: _photos));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _padded(context, [
      Text(widget.completing ? 'Mark the repair as done' : 'Update for the owner', style: theme.textTheme.titleLarge),
      const SizedBox(height: 12),
      TextField(
        controller: _note,
        maxLines: 3,
        maxLength: widget.completing ? 500 : 1000,
        decoration: InputDecoration(labelText: widget.completing ? 'What was done? (optional)' : 'What is happening?'),
      ),
      const SizedBox(height: 8),
      PhotoAttachments(photos: _photos, onChanged: (p) => setState(() {
        _photos = p;
        _error = null;
      }), label: widget.completing ? 'Photos of the repaired device' : 'Photos'),
      if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: theme.colorScheme.error))),
      const SizedBox(height: 12),
      SizedBox(width: double.infinity, child: FilledButton(onPressed: _submit, child: Text(widget.completing ? 'Mark as done' : 'Post update'))),
    ]);
  }
}

/* ---------- bringing the device back ---------- */

/// When the technician will bring the device back.
class ReturnTime {
  const ReturnTime({required this.date, this.slot});

  final DateTime date;
  final String? slot;
}

/// Asks for the return date and time (and an optional time window). The owner sees it. `null` if the technician backs out.
Future<ReturnTime?> askReturnTime(BuildContext context) => _sheet(context, (_) => const _ReturnSheet());

class _ReturnSheet extends StatefulWidget {
  const _ReturnSheet();

  @override
  State<_ReturnSheet> createState() => _ReturnSheetState();
}

class _ReturnSheetState extends State<_ReturnSheet> {
  final _slot = TextEditingController();
  DateTime? _when;
  String? _error;

  @override
  void dispose() {
    _slot.dispose();
    super.dispose();
  }

  Future<void> _choose() async {
    final now = DateTime.now();
    final date = await showDatePicker(context: context, initialDate: now.add(const Duration(days: 1)), firstDate: now, lastDate: now.add(const Duration(days: 60)), helpText: 'Return date');
    if (date == null || !mounted) return;
    final time = await showTimePicker(context: context, initialTime: const TimeOfDay(hour: 17, minute: 0), helpText: 'Return time');
    if (time == null) return;
    setState(() {
      _when = DateTime(date.year, date.month, date.day, time.hour, time.minute);
      _error = null;
    });
  }

  void _submit() {
    final when = _when;
    if (when == null) {
      setState(() => _error = 'Choose when you will bring it back.');
      return;
    }
    if (!when.isAfter(DateTime.now())) {
      setState(() => _error = 'Choose a time that has not passed yet.');
      return;
    }
    Navigator.pop(context, ReturnTime(date: when, slot: _slot.text.trim().isEmpty ? null : _slot.text.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return _padded(context, [
      Text('Bring it back', style: theme.textTheme.titleLarge),
      const SizedBox(height: 4),
      Text('The owner sees this time and confirms the handover when they have the device.', style: theme.textTheme.bodyMedium),
      const SizedBox(height: 12),
      OutlinedButton.icon(
        onPressed: _choose,
        icon: const Icon(Icons.event_outlined),
        label: Text(_when == null ? 'Choose date and time' : formatDateTime(_when)),
        style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48)),
      ),
      if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: theme.colorScheme.error))),
      const SizedBox(height: 12),
      TextField(controller: _slot, maxLength: 40, decoration: const InputDecoration(labelText: 'Time window (optional)', hintText: '17:00-19:00')),
      const SizedBox(height: 8),
      SizedBox(width: double.infinity, child: FilledButton(onPressed: _submit, child: const Text('Start delivery'))),
    ]);
  }
}
