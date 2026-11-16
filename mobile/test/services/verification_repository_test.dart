import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/photo_picker.dart';
import 'package:ewaste_opportunity/services/verification_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import '../fakes.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) {
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status, Object body) =>
    ResponseBody.fromString(jsonEncode(body), status, headers: {Headers.contentTypeHeader: [Headers.jsonContentType]});

({ApiClient client, _Adapter api}) _rig(Future<ResponseBody> Function(RequestOptions) handler) {
  final adapter = _Adapter(handler);
  final client = ApiClient(
    store: MemoryKeyValueStore(),
    dio: Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = adapter,
    refreshDio: Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = _Adapter((_) async => _json(500, {})),
  );
  return (client: client, api: adapter);
}

void main() {
  test('status reads the verification', () async {
    final rig = _rig((o) async => _json(200, {'success': true, 'data': verificationJson(status: 'pending', documents: [verificationDocJson()])}));
    final v = await VerificationRepository(rig.client).status();
    expect(rig.api.requests.single.path, '/verification/status');
    expect(v.status, 'pending');
    expect(v.documents, hasLength(1));
  });

  test('submit sends the kind and every photo as multipart', () async {
    final rig = _rig((o) async => _json(201, {'success': true, 'data': {}}));
    final dir = Directory.systemTemp.createTempSync('verif');
    addTearDown(() {
      // Windows keeps the files locked until Dart lets go of them; a leftover temp folder is harmless.
      try {
        dir.deleteSync(recursive: true);
      } on FileSystemException {
        // ignore
      }
    });
    final a = File('${dir.path}/a.jpg')..writeAsBytesSync([1, 2, 3]);
    final b = File('${dir.path}/b.jpg')..writeAsBytesSync([4, 5, 6]);
    await VerificationRepository(rig.client).submit('id_proof', [
      PickedPhoto(path: a.path, name: 'a.jpg', mime: 'image/jpeg', bytes: 3),
      PickedPhoto(path: b.path, name: 'b.jpg', mime: 'image/jpeg', bytes: 3),
    ]);
    final sent = rig.api.requests.single;
    expect(sent.method, 'POST');
    expect(sent.path, '/verification/documents');
    final form = sent.data as FormData;
    expect(form.fields.single.key, 'docType');
    expect(form.fields.single.value, 'id_proof');
    expect(form.files.map((f) => f.key), ['documents', 'documents']);
    expect(form.files.map((f) => f.value.filename), ['a.jpg', 'b.jpg']);
  });

  test('remove deletes one document', () async {
    final rig = _rig((o) async => _json(200, {'success': true, 'data': {}}));
    await VerificationRepository(rig.client).remove('d9');
    expect(rig.api.requests.single.method, 'DELETE');
    expect(rig.api.requests.single.path, '/verification/documents/d9');
  });

  test('a refused removal becomes an ApiException with the server message', () async {
    final rig = _rig((o) async => _json(409, {'success': false, 'message': 'Approved documents cannot be removed.', 'code': 'DOC_APPROVED'}));
    await expectLater(
      VerificationRepository(rig.client).remove('d1'),
      throwsA(isA<ApiException>().having((e) => e.code, 'code', 'DOC_APPROVED').having((e) => e.message, 'message', contains('Approved'))),
    );
  });
}
