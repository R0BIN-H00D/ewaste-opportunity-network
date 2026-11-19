import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/network/api_exception.dart';
import '../../services/admin_repository.dart';
import 'admin_widgets.dart';

const _channel = MethodChannel('ewaste/admin_files');

Future<bool> saveAdminCsv(AdminFile file) async =>
    await _channel.invokeMethod<bool>('saveCsv', {
      'bytes': file.bytes,
      'name': file.name,
    }) ??
    false;

class AdminDocumentPage extends StatefulWidget {
  const AdminDocumentPage({super.key, required this.repository, required this.url});
  final AdminRepository repository;
  final String url;

  @override
  State<AdminDocumentPage> createState() => _AdminDocumentPageState();
}

class _AdminDocumentPageState extends State<AdminDocumentPage> {
  late var _file = _get();
  Future<AdminFile> _get() async => widget.repository.verificationDocument(widget.url);

  @override
  Widget build(BuildContext context) => AdminScaffold(
        title: 'Verification document',
        child: AdminLoad(
          future: _file,
          retry: () => setState(() => _file = _get()),
          builder: (context, file) {
            if (file.mime.toLowerCase() == 'application/pdf') return _PdfPreview(file: file);
            if (file.mime.toLowerCase().startsWith('image/')) {
              return InteractiveViewer(
                maxScale: 5,
                child: Center(
                    child: Image.memory(file.bytes,
                        errorBuilder: (_, __, ___) => const Text('This image could not be opened.'))),
              );
            }
            return const Center(child: Text('This document format cannot be previewed.'));
          },
        ),
      );
}

class _PdfPreview extends StatefulWidget {
  const _PdfPreview({required this.file});
  final AdminFile file;

  @override
  State<_PdfPreview> createState() => _PdfPreviewState();
}

class _PdfPreviewState extends State<_PdfPreview> {
  int _index = 0;
  late var _page = _render();

  Future<({Uint8List image, int total})> _render() async {
    try {
      final result =
          await _channel.invokeMapMethod<String, dynamic>('renderPdf', {'bytes': widget.file.bytes, 'page': _index});
      return (image: result!['image'] as Uint8List, total: result['total'] as int);
    } on PlatformException {
      throw const ApiException('This PDF could not be opened.');
    }
  }

  void _go(int page) => setState(() {
        _index = page;
        _page = _render();
      });

  @override
  Widget build(BuildContext context) => AdminLoad(
        future: _page,
        retry: () => _go(_index),
        builder: (context, result) => Column(
          children: [
            Expanded(
              child: InteractiveViewer(
                key: ValueKey(_index),
                maxScale: 5,
                child: Center(child: Image.memory(result.image)),
              ),
            ),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              IconButton(
                  onPressed: _index == 0 ? null : () => _go(_index - 1),
                  tooltip: 'Previous page',
                  icon: const Icon(Icons.chevron_left)),
              Text('Page ${_index + 1} of ${result.total}'),
              IconButton(
                  onPressed: _index + 1 >= result.total ? null : () => _go(_index + 1),
                  tooltip: 'Next page',
                  icon: const Icon(Icons.chevron_right)),
            ]),
          ],
        ),
      );
}
