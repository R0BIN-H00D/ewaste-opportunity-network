import 'package:material_ui/material_ui.dart';
import '../../core/refurbishment_validation.dart';
import '../../services/photo_picker.dart';
import '../../widgets/photo_attachments.dart';

/// What a refurbisher typed when offering for a device.
class OfferInput {
  const OfferInput({this.amount, this.message = ''});

  /// Rupees the refurbisher will pay the owner; null for free collection.
  final double? amount;
  final String message;
}

/// The offer form: an optional amount and a short message. `null` if they back out.
Future<OfferInput?> askOffer(BuildContext context, {required String title}) {
  return showModalBottomSheet<OfferInput>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _OfferSheet(title: title),
  );
}

class _OfferSheet extends StatefulWidget {
  const _OfferSheet({required this.title});

  final String title;

  @override
  State<_OfferSheet> createState() => _OfferSheetState();
}

class _OfferSheetState extends State<_OfferSheet> {
  final _formKey = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _message = TextEditingController();

  @override
  void dispose() {
    _amount.dispose();
    _message.dispose();
    super.dispose();
  }

  void _send() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.pop(context, OfferInput(amount: parseMoney(_amount.text), message: _message.text.trim()));
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
              Text('Offer to refurbish this device', style: theme.textTheme.titleLarge),
              Text(widget.title, style: theme.textTheme.bodyMedium),
              const SizedBox(height: 12),
              TextFormField(
                controller: _amount,
                validator: validateOfferAmount,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Amount you will pay the owner, in rupees (optional)', helperText: 'Leave empty to collect it for free. The app never handles the money.'),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _message,
                validator: validateOfferMessage,
                maxLines: 3,
                maxLength: 1000,
                decoration: const InputDecoration(labelText: 'A message for the owner (optional)'),
              ),
              const SizedBox(height: 8),
              FilledButton(onPressed: _send, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), child: const Text('Send offer')),
            ],
          ),
        ),
      ),
    );
  }
}

/// Asks for an optional note to put in the work log. `null` if they back out; an empty string for no note.
Future<String?> askWorkNote(BuildContext context, {required String title, required String confirmLabel, String? message}) {
  return showDialog<String>(
    context: context,
    builder: (ctx) => _NoteDialog(title: title, confirmLabel: confirmLabel, message: message),
  );
}

class _NoteDialog extends StatefulWidget {
  const _NoteDialog({required this.title, required this.confirmLabel, this.message});

  final String title;
  final String confirmLabel;
  final String? message;

  @override
  State<_NoteDialog> createState() => _NoteDialogState();
}

class _NoteDialogState extends State<_NoteDialog> {
  final _formKey = GlobalKey<FormState>();
  final _note = TextEditingController();

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.title),
      content: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (widget.message != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(widget.message!)),
            TextFormField(controller: _note, validator: validateJobNote, maxLines: 3, maxLength: 500, decoration: const InputDecoration(labelText: 'Note for the work log (optional)')),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Not now')),
        FilledButton(
          onPressed: () {
            if (_formKey.currentState!.validate()) Navigator.pop(context, _note.text.trim());
          },
          child: Text(widget.confirmLabel),
        ),
      ],
    );
  }
}

/// Photos the refurbisher chose for one stage of a job.
class PhotoUpload {
  const PhotoUpload({required this.stage, required this.photos, this.note = ''});

  final String stage;
  final List<PickedPhoto> photos;
  final String note;
}

/// The "add photos" sheet. [stages] are the sets that can be added now (`before`, `after`). `null` if they back out.
Future<PhotoUpload?> askJobPhotos(BuildContext context, {required List<String> stages}) {
  return showModalBottomSheet<PhotoUpload>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _PhotosSheet(stages: stages),
  );
}

class _PhotosSheet extends StatefulWidget {
  const _PhotosSheet({required this.stages});

  final List<String> stages;

  @override
  State<_PhotosSheet> createState() => _PhotosSheetState();
}

class _PhotosSheetState extends State<_PhotosSheet> {
  final _note = TextEditingController();
  late String _stage = widget.stages.contains('after') && !widget.stages.contains('before') ? 'after' : widget.stages.first;
  List<PickedPhoto> _photos = const [];
  String? _error;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  void _send() {
    if (_photos.isEmpty) {
      setState(() => _error = 'Choose at least one photo');
      return;
    }
    final problem = validateJobNote(_note.text);
    if (problem != null) {
      setState(() => _error = problem);
      return;
    }
    Navigator.pop(context, PhotoUpload(stage: _stage, photos: _photos, note: _note.text.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Add photos', style: theme.textTheme.titleLarge),
            const SizedBox(height: 8),
            if (widget.stages.length > 1)
              SegmentedButton<String>(
                segments: const [ButtonSegment(value: 'before', label: Text('Before')), ButtonSegment(value: 'after', label: Text('After'))],
                selected: {_stage},
                onSelectionChanged: (v) => setState(() => _stage = v.first),
              )
            else
              Text(_stage == 'before' ? 'Photos of the device as you received it.' : 'Photos of the finished device.', style: theme.textTheme.bodyMedium),
            const SizedBox(height: 12),
            PhotoAttachments(photos: _photos, onChanged: (p) => setState(() {
                  _photos = p;
                  _error = null;
                }), max: 4, label: 'Photos'),
            const SizedBox(height: 8),
            TextField(controller: _note, maxLines: 2, maxLength: 500, decoration: const InputDecoration(labelText: 'Note for the work log (optional)')),
            if (_error != null) Padding(padding: const EdgeInsets.only(bottom: 8), child: Text(_error!, style: TextStyle(color: theme.colorScheme.error))),
            FilledButton(onPressed: _send, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), child: const Text('Upload photos')),
          ],
        ),
      ),
    );
  }
}
