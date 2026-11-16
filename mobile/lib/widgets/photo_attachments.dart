import 'dart:io';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../core/listing_validation.dart';
import '../providers/photo_providers.dart';
import '../services/photo_picker.dart';

/// Photos to send along with something: take one with the camera or choose from the gallery, see them, remove one.
/// The list lives with the caller ([photos] and [onChanged]); only JPEG, PNG and WebP up to 5 MB are accepted.
class PhotoAttachments extends ConsumerStatefulWidget {
  const PhotoAttachments({super.key, required this.photos, required this.onChanged, this.max = 4, this.label = 'Photos'});

  final List<PickedPhoto> photos;
  final ValueChanged<List<PickedPhoto>> onChanged;
  final int max;
  final String label;

  @override
  ConsumerState<PhotoAttachments> createState() => _PhotoAttachmentsState();
}

class _PhotoAttachmentsState extends ConsumerState<PhotoAttachments> {
  String? _note;

  void _add(List<PickedPhoto> picked) {
    final notes = <String>[];
    final next = [...widget.photos];
    for (final p in picked) {
      if (next.length >= widget.max) {
        notes.add('You can add up to ${widget.max} photos.');
        break;
      }
      final problem = photoProblem(mime: p.mime, bytes: p.bytes);
      if (problem == null) {
        next.add(p);
      } else {
        notes.add('${p.name}: $problem');
      }
    }
    setState(() => _note = notes.isEmpty ? null : notes.toSet().join('\n'));
    widget.onChanged(next);
  }

  Future<void> _pick(Future<List<PickedPhoto>> Function() action) async {
    setState(() => _note = null);
    try {
      _add(await action());
    } on PlatformException {
      if (mounted) setState(() => _note = 'Could not open that. Check that the app is allowed to use the camera and photos, or try the other option.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final full = widget.photos.length >= widget.max;
    final picker = ref.read(photoPickerProvider);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('${widget.label}: ${widget.photos.length} of ${widget.max}', style: theme.textTheme.titleSmall),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            OutlinedButton.icon(
              onPressed: full
                  ? null
                  : () => _pick(() async {
                        final photo = await picker.takePhoto();
                        return photo == null ? const <PickedPhoto>[] : [photo];
                      }),
              icon: const Icon(Icons.photo_camera_outlined),
              label: const Text('Take photo'),
              style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48)),
            ),
            OutlinedButton.icon(
              onPressed: full ? null : () => _pick(() => picker.choosePhotos(limit: widget.max - widget.photos.length)),
              icon: const Icon(Icons.photo_library_outlined),
              label: const Text('Choose'),
              style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48)),
            ),
          ],
        ),
        if (_note != null) ...[const SizedBox(height: 8), Text(_note!, style: TextStyle(color: theme.colorScheme.error))],
        if (widget.photos.isNotEmpty) ...[
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (var i = 0; i < widget.photos.length; i++)
                Stack(
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(12),
                      child: Image.file(File(widget.photos[i].path), width: 72, height: 72, fit: BoxFit.cover, errorBuilder: (_, __, ___) => const SizedBox(width: 72, height: 72, child: Icon(Icons.image_outlined))),
                    ),
                    Positioned(
                      top: -4,
                      right: -4,
                      child: IconButton(
                        tooltip: 'Remove photo ${i + 1}',
                        visualDensity: VisualDensity.compact,
                        constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                        icon: Container(
                          decoration: BoxDecoration(color: theme.colorScheme.surface, shape: BoxShape.circle),
                          padding: const EdgeInsets.all(2),
                          child: const Icon(Icons.close, size: 16),
                        ),
                        onPressed: () => widget.onChanged([...widget.photos]..removeAt(i)),
                      ),
                    ),
                  ],
                ),
            ],
          ),
        ],
      ],
    );
  }
}
