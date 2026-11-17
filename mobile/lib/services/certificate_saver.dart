import 'dart:io';
import 'dart:typed_data';
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';

/// Hands a certificate PDF to the phone's own share sheet, where the person can save it, open it or send it.
/// Kept behind a class so tests do not need the platform.
class CertificateSaver {
  const CertificateSaver();

  Future<void> share(String filename, Uint8List bytes) async {
    final dir = await getTemporaryDirectory();
    final file = File('${dir.path}${Platform.pathSeparator}$filename');
    await file.writeAsBytes(bytes, flush: true);
    await SharePlus.instance.share(ShareParams(files: [XFile(file.path, mimeType: 'application/pdf')], subject: filename));
  }
}