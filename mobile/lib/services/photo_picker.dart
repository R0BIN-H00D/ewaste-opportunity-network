import 'package:image_picker/image_picker.dart';
import '../core/listing_validation.dart';

/// A photo the person chose, ready to preview and upload.
class PickedPhoto {
  const PickedPhoto({required this.path, required this.name, required this.mime, required this.bytes});

  final String path;
  final String name;
  final String mime;
  final int bytes;
}

/// Takes or chooses photos. An interface so tests can hand in photos without a camera.
abstract class PhotoPicker {
  Future<PickedPhoto?> takePhoto();

  /// Up to [limit] photos from the gallery.
  Future<List<PickedPhoto>> choosePhotos({required int limit});
}

/// The real picker. The system camera and gallery do the work; photos are shrunk to at most 1600 px and re-saved at
/// quality 80 so a phone photo uploads in a second or two instead of ten.
class ImagePhotoPicker implements PhotoPicker {
  ImagePhotoPicker([ImagePicker? picker]) : _picker = picker ?? ImagePicker();

  final ImagePicker _picker;

  static const _maxSide = 1600.0;
  static const _quality = 80;

  Future<PickedPhoto> _wrap(XFile file) async {
    final name = file.name.isEmpty ? file.path.split(RegExp(r'[\\/]')).last : file.name;
    var mime = mimeFromName(name);
    if (mime.isEmpty) mime = file.mimeType ?? '';
    return PickedPhoto(path: file.path, name: name, mime: mime, bytes: await file.length());
  }

  @override
  Future<PickedPhoto?> takePhoto() async {
    final file = await _picker.pickImage(source: ImageSource.camera, maxWidth: _maxSide, maxHeight: _maxSide, imageQuality: _quality);
    return file == null ? null : _wrap(file);
  }

  @override
  Future<List<PickedPhoto>> choosePhotos({required int limit}) async {
    final files = await _picker.pickMultiImage(maxWidth: _maxSide, maxHeight: _maxSide, imageQuality: _quality, limit: limit);
    return [for (final f in files.take(limit)) await _wrap(f)];
  }
}
