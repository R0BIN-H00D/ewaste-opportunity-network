import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/photo_picker.dart';

/// Overridden with a fake in tests.
final photoPickerProvider = Provider<PhotoPicker>((ref) => ImagePhotoPicker());
