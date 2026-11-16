import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/models/recycling.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/photo_picker.dart';
import 'package:ewaste_opportunity/services/recycling_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import '../models/recycling_models_test.dart';
import '../models/supervision_report_models_test.dart' show reportJson;

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

Future<ResponseBody> _request(RequestOptions o) async => _json(200, {'success': true, 'data': recyclingJson(status: 'accepted')});

void main() {
  group('centres', () {
    test('list reads centres and paging, and sends only the filters that are set', () async {
      final rig = _rig((o) async => _json(200, {
            'success': true,
            'data': [centerJson(), centerJson(id: 'ce2', name: 'EcoWorks')],
            'meta': {'page': 1, 'pages': 3, 'total': 30},
          }));
      final page = await RecyclingRepository(rig.client).centers(const CenterQuery(q: ' green ', category: 'phones'));

      expect(page.items.map((c) => c.name), ['GreenCycle Recyclers', 'EcoWorks']);
      expect(page.pages, 3);
      expect(page.total, 30);
      final sent = rig.api.requests.single;
      expect(sent.path, '/recycling-centers');
      expect(sent.queryParameters['q'], 'green');
      expect(sent.queryParameters['category'], 'phones');
    });

    test('an empty query sends no filters at all', () async {
      final rig = _rig((o) async => _json(200, {'success': true, 'data': <Object>[]}));
      await RecyclingRepository(rig.client).centers(const CenterQuery());
      expect(rig.api.requests.single.queryParameters.keys, unorderedEquals(['page', 'limit']));
    });

    test('one centre', () async {
      final rig = _rig((o) async => _json(200, {'success': true, 'data': centerJson(detail: true)}));
      final c = await RecyclingRepository(rig.client).center('ce1');
      expect(rig.api.requests.single.path, '/recycling-centers/ce1');
      expect(c.facilityDetails, isNotNull);
    });

    test('the query counts its filters', () {
      expect(const CenterQuery().activeFilters, 0);
      expect(const CenterQuery(category: 'phones').activeFilters, 1);
    });
  });

  group('requests', () {
    test('create sends every field as multipart, with the categories as a list and each photo', () async {
      final rig = _rig((o) async => _json(201, {'success': true, 'data': recyclingJson()}));
      final dir = Directory.systemTemp.createTempSync('recycling');
      addTearDown(() {
        try {
          dir.deleteSync(recursive: true);
        } on FileSystemException {
          // Windows keeps files locked until Dart lets go of them; a leftover temp folder is harmless.
        }
      });
      final photo = File('${dir.path}/a.jpg')..writeAsBytesSync([1, 2, 3]);

      final r = await RecyclingRepository(rig.client).create(
        centerId: 'ce1',
        categoryIds: ['c1', 'c2'],
        deviceCount: 3,
        area: ' Indiranagar ',
        address: '12 MG Road',
        preferredDate: DateTime.utc(2026, 12, 1),
        notes: '',
        listingId: 'l1',
        photos: [PickedPhoto(path: photo.path, name: 'a.jpg', mime: 'image/jpeg', bytes: 3)],
      );

      expect(r.refNo, 'REC-2026-AB12CD');
      final sent = rig.api.requests.single;
      expect(sent.method, 'POST');
      expect(sent.path, '/recycling-requests');
      final form = sent.data as FormData;
      final fields = {for (final f in form.fields) f.key: f.value};
      expect(fields['centerId'], 'ce1');
      expect(jsonDecode(fields['categories']!), ['c1', 'c2']);
      expect(fields['deviceCount'], '3');
      expect(fields['pickupAddressArea'], 'Indiranagar');
      expect(fields['pickupAddress'], '12 MG Road');
      expect(fields['preferredDate'], '2026-12-01T00:00:00.000Z');
      expect(fields['listingId'], 'l1');
      expect(fields.containsKey('notes'), isFalse); // empty notes are left out
      expect(form.files.single.key, 'photos');
      expect(form.files.single.value.filename, 'a.jpg');
    });

    test('list asks for the status and role it is given, and reads the short form', () async {
      final rig = _rig((o) async => _json(200, {
            'success': true,
            'data': [recyclingJson(detail: false)],
            'meta': {'page': 2, 'pages': 4, 'total': 35},
          }));
      final page = await RecyclingRepository(rig.client).list(as: 'center', status: 'requested', page: 2);

      final q = rig.api.requests.single.queryParameters;
      expect(q['as'], 'center');
      expect(q['status'], 'requested');
      expect(q['page'], 2);
      expect(page.items.single.deviceCount, 3);
      expect(page.pages, 4);
    });

    test('list leaves out an empty status and an unset role', () async {
      final rig = _rig((o) async => _json(200, {'success': true, 'data': <Object>[]}));
      await RecyclingRepository(rig.client).list(status: '');
      expect(rig.api.requests.single.queryParameters.containsKey('status'), isFalse);
      expect(rig.api.requests.single.queryParameters.containsKey('as'), isFalse);
    });

    test('get reads one request with its actions', () async {
      final rig = _rig((o) async => _json(200, {'success': true, 'data': recyclingJson(actions: ['cancel'])}));
      final r = await RecyclingRepository(rig.client).get('rr1');
      expect(rig.api.requests.single.path, '/recycling-requests/rr1');
      expect(r.can('cancel'), isTrue);
    });
  });

  group('the centre\'s steps', () {
    test('each status change is a PUT with the status the server expects', () async {
      final rig = _rig(_request);
      final repo = RecyclingRepository(rig.client);
      await repo.accept('rr1');
      await repo.reject('rr1', ' No capacity ');
      await repo.markReceived('rr1');
      await repo.markProcessed('rr1');
      await repo.complete('rr1');

      expect(rig.api.requests.every((o) => o.method == 'PUT' && o.path == '/recycling-requests/rr1/status'), isTrue);
      expect(rig.api.requests.map((o) => (o.data as Map)['status']), ['accepted', 'rejected', 'received_at_center', 'processed', 'completed']);
      expect((rig.api.requests[1].data as Map)['reason'], 'No capacity');
      expect((rig.api.requests[0].data as Map).containsKey('reason'), isFalse);
    });

    test('a pickup is sent as a UTC time with the optional slot and notes', () async {
      final rig = _rig(_request);
      await RecyclingRepository(rig.client).schedulePickup('rr1', date: DateTime.utc(2026, 11, 20, 10), timeSlot: ' Morning ', notes: '');
      final sent = rig.api.requests.single;
      expect(sent.method, 'POST');
      expect(sent.path, '/recycling-requests/rr1/pickup');
      expect(sent.data, {'date': '2026-11-20T10:00:00.000Z', 'timeSlot': 'Morning'});
    });

    test('confirming the handover sends the checklist tick only when given', () async {
      final rig = _rig(_request);
      final repo = RecyclingRepository(rig.client);
      await repo.confirmHandover('rr1', acknowledgeChecklist: true);
      await repo.confirmHandover('rr1');
      expect(rig.api.requests[0].path, '/recycling-requests/rr1/confirm-handover');
      expect(rig.api.requests[0].data, {'acknowledgeChecklist': true});
      expect(rig.api.requests[1].data, <String, dynamic>{});
    });

    test('materials keep measured and estimated weights apart', () async {
      final rig = _rig(_request);
      await RecyclingRepository(rig.client).saveMaterials(
        'rr1',
        const [RecoveredMaterial(type: 'copper', actualKg: 4.5), RecoveredMaterial(type: 'plastics', estimatedKg: 2)],
        reportNotes: ' Sorted by hand ',
      );
      final sent = rig.api.requests.single;
      expect(sent.method, 'PUT');
      expect(sent.path, '/recycling-requests/rr1/materials');
      expect(sent.data, {
        'materials': [
          {'type': 'copper', 'actualKg': 4.5},
          {'type': 'plastics', 'estimatedKg': 2.0},
        ],
        'reportNotes': 'Sorted by hand',
      });
    });

    test('cancel sends the reason only when there is one', () async {
      final rig = _rig(_request);
      final repo = RecyclingRepository(rig.client);
      await repo.cancel('rr1', reason: ' Changed my mind ');
      await repo.cancel('rr1');
      expect(rig.api.requests[0].path, '/recycling-requests/rr1/cancel');
      expect(rig.api.requests[0].data, {'reason': 'Changed my mind'});
      expect(rig.api.requests[1].data, <String, dynamic>{});
    });

    test('a refusal becomes an ApiException with the server code', () async {
      final rig = _rig((o) async => _json(409, {'success': false, 'message': 'This request was just changed.', 'code': 'STALE_STATE'}));
      await expectLater(
        RecyclingRepository(rig.client).accept('rr1'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'STALE_STATE').having((e) => e.failure, 'failure', ApiFailure.conflict)),
      );
    });
  });

  group('the activity report', () {
    test('asks for calendar days and reads the report', () async {
      final rig = _rig((o) async => _json(200, {'success': true, 'data': reportJson()}));
      final report = await RecyclingRepository(rig.client).report(from: DateTime(2026, 11, 1), to: DateTime(2026, 11, 16));
      expect(report.completedCount, 4);
      final sent = rig.api.requests.single;
      expect(sent.path, '/recycling-requests/report');
      expect(sent.queryParameters['from'], '2026-11-01');
      expect(sent.queryParameters['to'], '2026-11-16T23:59:59.999Z');
      expect(sent.queryParameters.containsKey('category'), isFalse);
    });

    test('all time sends no dates, and another centre\'s account is refused', () async {
      final rig = _rig((o) async => _json(403, {'success': false, 'message': 'You do not run a recycling centre', 'code': 'FORBIDDEN'}));
      await expectLater(RecyclingRepository(rig.client).report(), throwsA(isA<ApiException>().having((e) => e.failure, 'failure', ApiFailure.forbidden)));
      expect(rig.api.requests.single.queryParameters, isEmpty);
    });
  });
}
