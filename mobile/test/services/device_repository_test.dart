import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/models/listing_input.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/device_repository.dart';
import 'package:ewaste_opportunity/services/photo_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import '../models/listing_test.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;
  final requests = <RequestOptions>[];
  final bodies = <Object?>[]; // the body as it was when each call was made (the same options object is reused on a replay)

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) {
    requests.add(options);
    bodies.add(options.data);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status, Object body) =>
    ResponseBody.fromString(jsonEncode(body), status, headers: {Headers.contentTypeHeader: [Headers.jsonContentType]});

({DeviceRepository repo, _Adapter api, _Adapter refresh, ApiClient client}) _rig(Future<ResponseBody> Function(RequestOptions) api,
    [Future<ResponseBody> Function(RequestOptions)? refresh]) {
  final apiAdapter = _Adapter(api);
  final refreshAdapter = _Adapter(refresh ?? (_) async => _json(500, {}));
  final client = ApiClient(
    store: MemoryKeyValueStore(),
    dio: Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = apiAdapter,
    refreshDio: Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = refreshAdapter,
  );
  return (repo: DeviceRepository(client), api: apiAdapter, refresh: refreshAdapter, client: client);
}

void main() {
  test('list reads items and paging, and sends only the filters that are set', () async {
    final rig = _rig((o) async => _json(200, {
          'success': true,
          'data': [listingJson(), listingJson(id: 'l2')],
          'meta': {'page': 1, 'pages': 3, 'total': 30},
        }));

    final page = await rig.repo.list(const ListingQuery(q: 'phone', service: 'repair'));

    expect(page.items.map((l) => l.id), ['l1', 'l2']);
    expect(page.pages, 3);
    expect(page.total, 30);
    expect(page.hasMore, isTrue);
    final sent = rig.api.requests.single;
    expect(sent.path, '/devices');
    expect(sent.queryParameters['q'], 'phone');
    expect(sent.queryParameters['service'], 'repair');
    expect(sent.queryParameters.containsKey('city'), isFalse);
  });

  test('get reads one listing', () async {
    final rig = _rig((o) async => _json(200, {'success': true, 'data': listingJson(id: 'abc', isOwner: true)}));
    final l = await rig.repo.get('abc');
    expect(rig.api.requests.single.path, '/devices/abc');
    expect(l.isOwner, isTrue);
  });

  test('categories reads the list', () async {
    final rig = _rig((o) async => _json(200, {
          'success': true,
          'data': [
            {'_id': 'c1', 'name': 'Phones', 'slug': 'phones'}
          ],
        }));
    final cats = await rig.repo.categories();
    expect(cats.single.slug, 'phones');
  });

  test('a server error becomes an ApiException with the server\'s words', () async {
    final rig = _rig((o) async => _json(409, {'success': false, 'message': 'This listing is part of a service', 'code': 'LISTING_LOCKED'}));
    await expectLater(
      rig.repo.remove('l1'),
      throwsA(isA<ApiException>().having((e) => e.message, 'message', 'This listing is part of a service').having((e) => e.statusCode, 'status', 409)),
    );
  });

  group('create', () {
    late Directory dir;
    late PickedPhoto photo;

    setUp(() async {
      dir = await Directory.systemTemp.createTemp('photos');
      final file = File('${dir.path}/front.jpg')..writeAsBytesSync([0xFF, 0xD8, 0xFF, 0xE0, 1, 2, 3]);
      photo = PickedPhoto(path: file.path, name: 'front.jpg', mime: 'image/jpeg', bytes: 7);
    });

    tearDown(() async {
      // On Windows a file that was opened for upload may stay locked for a moment; a leftover temp folder does not matter.
      try {
        await dir.delete(recursive: true);
      } on FileSystemException {
        // ignore
      }
    });

    const input = ListingInput(name: 'Phone', category: 'phones', condition: 'fully_working', preferredService: 'reuse', city: 'Pune');

    test('sends the fields and each photo as a "photos" part with its content type', () async {
      final rig = _rig((o) async => _json(201, {'success': true, 'data': listingJson(id: 'new')}));
      final progress = <double>[];

      final listing = await rig.repo.create(input, [photo], onProgress: progress.add);

      expect(listing.id, 'new');
      final sent = rig.api.requests.single;
      expect(sent.method, 'POST');
      expect(sent.path, '/devices');
      final form = sent.data as FormData;
      final fields = {for (final f in form.fields) f.key: f.value};
      expect(fields['name'], 'Phone');
      expect(fields['category'], 'phones');
      expect(fields['status'], 'listed');
      expect(fields['city'], 'Pune');
      expect(form.files, hasLength(1));
      expect(form.files.single.key, 'photos');
      expect(form.files.single.value.filename, 'front.jpg');
      expect(form.files.single.value.contentType?.mimeType, 'image/jpeg');
    });

    test('works without photos', () async {
      final rig = _rig((o) async => _json(201, {'success': true, 'data': listingJson(id: 'n2')}));
      await rig.repo.create(input, const []);
      expect((rig.api.requests.single.data as FormData).files, isEmpty);
    });

    test('field errors from the server are kept by field name', () async {
      final rig = _rig((o) async => _json(422, {
            'success': false,
            'message': 'Validation failed',
            'code': 'VALIDATION_ERROR',
            'errors': [
              {'field': 'body.name', 'message': 'Name is too short'}
            ],
          }));
      await expectLater(
        rig.repo.create(input, const []),
        throwsA(isA<ApiException>().having((e) => e.fieldErrors['name'], 'name error', 'Name is too short')),
      );
    });

    test('an upload that is refused with 401 is sent again as a fresh form after the token is refreshed', () async {
      final rig = _rig(
        (o) async {
          if (o.headers['Authorization'] == 'Bearer new-access') return _json(201, {'success': true, 'data': listingJson(id: 'again')});
          return _json(401, {'success': false, 'message': 'Your session has expired', 'code': 'TOKEN_EXPIRED'});
        },
        (o) async => _json(200, {
          'success': true,
          'data': {'accessToken': 'new-access', 'refreshToken': 'r2', 'expiresIn': 900},
        }),
      );
      await rig.client.adoptSession(accessToken: 'old-access', refreshToken: 'r1');

      final listing = await rig.repo.create(input, [photo]);

      expect(listing.id, 'again');
      expect(rig.api.requests, hasLength(2));
      final first = rig.api.bodies[0] as FormData;
      final second = rig.api.bodies[1] as FormData;
      expect(identical(first, second), isFalse, reason: 'a form that was sent once cannot be sent again');
      expect(second.files, hasLength(1));
      expect(second.fields.map((f) => f.key), contains('name'));
    });
  });
}
