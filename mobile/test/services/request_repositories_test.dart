import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/request_repository.dart';
import 'package:ewaste_opportunity/services/technician_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import '../models/request_models_test.dart';

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

Future<ResponseBody> _request(RequestOptions o) async => _json(200, {'success': true, 'data': requestJson(status: 'cancelled')});

void main() {
  group('TechnicianRepository', () {
    test('list reads technicians and paging, and sends only the filters that are set', () async {
      final rig = _rig((o) async => _json(200, {
            'success': true,
            'data': [technicianJson(), technicianJson(id: 't2', name: 'Meena')],
            'meta': {'page': 1, 'pages': 2, 'total': 14},
          }));
      final page = await TechnicianRepository(rig.client).list(const TechnicianQuery(q: 'screen', availableOnly: true, minRating: 4));

      expect(page.items.map((t) => t.name), ['Ravi Kumar', 'Meena']);
      expect(page.pages, 2);
      final sent = rig.api.requests.single;
      expect(sent.path, '/technicians');
      expect(sent.queryParameters['q'], 'screen');
      expect(sent.queryParameters['available'], 'true');
      expect(sent.queryParameters['minRating'], 4);
      expect(sent.queryParameters.containsKey('city'), isFalse);
    });

    test('a plain query leaves out the optional filters', () {
      final params = const TechnicianQuery().toParams();
      expect(params.keys, unorderedEquals(['page', 'limit', 'sort']));
    });

    test('get reads one technician', () async {
      final rig = _rig((o) async => _json(200, {'success': true, 'data': technicianJson(id: 'abc')}));
      final t = await TechnicianRepository(rig.client).get('abc');
      expect(rig.api.requests.single.path, '/technicians/abc');
      expect(t.id, 'abc');
    });
  });

  group('RequestRepository', () {
    test('create sends the listing, issue and technician, and trims the text', () async {
      final rig = _rig(_request);
      await RequestRepository(rig.client).create(listingId: 'l1', issue: '  Screen is cracked ', technicianId: 't1', onSite: true);

      final sent = rig.api.requests.single;
      expect(sent.method, 'POST');
      expect(sent.path, '/service-requests');
      expect(sent.data, {'listingId': 'l1', 'issueDescription': 'Screen is cracked', 'technicianId': 't1', 'onSite': true});
    });

    test('an open request leaves the technician and on-site flag out', () async {
      final rig = _rig(_request);
      await RequestRepository(rig.client).create(listingId: 'l1', issue: 'Will not charge');
      expect(rig.api.requests.single.data, {'listingId': 'l1', 'issueDescription': 'Will not charge'});
    });

    test('list asks for the person\'s own requests, and only open ones when told to', () async {
      final rig = _rig((o) async => _json(200, {
            'success': true,
            'data': [requestJson()],
            'meta': {'page': 1, 'pages': 1, 'total': 1},
          }));
      final page = await RequestRepository(rig.client).list(activeOnly: true);

      expect(page.items.single.id, 'r1');
      final sent = rig.api.requests.single;
      expect(sent.queryParameters['as'], 'customer');
      expect(sent.queryParameters['active'], 'true');
    });

    test('approving and declining a quote use the decision endpoint', () async {
      final rig = _rig(_request);
      final repo = RequestRepository(rig.client);
      await repo.decideQuotation('r1', 'q1', accept: true);
      await repo.decideQuotation('r1', 'q1', accept: false, reason: ' too costly ', cancel: true);

      expect(rig.api.requests[0].method, 'PUT');
      expect(rig.api.requests[0].path, '/service-requests/r1/quotation/q1/decision');
      expect(rig.api.requests[0].data, {'decision': 'accept'});
      expect(rig.api.requests[1].data, {'decision': 'reject', 'reason': 'too costly', 'cancel': true});
    });

    test('cancel sends the reason only when there is one', () async {
      final rig = _rig(_request);
      final repo = RequestRepository(rig.client);
      await repo.cancel('r1');
      await repo.cancel('r1', reason: 'changed my mind');
      expect(rig.api.requests[0].path, '/service-requests/r1/cancel');
      expect(rig.api.requests[0].data, <String, dynamic>{});
      expect(rig.api.requests[1].data, {'reason': 'changed my mind'});
    });

    test('pickup is sent as a UTC time', () async {
      final rig = _rig(_request);
      await RequestRepository(rig.client).schedulePickup('r1', date: DateTime.utc(2026, 11, 20, 5, 30), timeSlot: 'Morning');
      expect(rig.api.requests.single.path, '/service-requests/r1/pickup');
      expect(rig.api.requests.single.data, {'date': '2026-11-20T05:30:00.000Z', 'timeSlot': 'Morning'});
    });

    test('handover carries the checklist tick only when given', () async {
      final rig = _rig(_request);
      final repo = RequestRepository(rig.client);
      await repo.confirmHandover('r1', acknowledgeChecklist: true);
      await repo.confirmHandover('r1');
      expect(rig.api.requests[0].data, {'acknowledgeChecklist': true});
      expect(rig.api.requests[1].data, <String, dynamic>{});
    });

    test('completion posts to confirm-completion', () async {
      final rig = _rig(_request);
      await RequestRepository(rig.client).confirmCompletion('r1');
      expect(rig.api.requests.single.path, '/service-requests/r1/confirm-completion');
    });

    test('a refusal from the server becomes an ApiException with its message and field errors', () async {
      final rig = _rig((o) async => _json(409, {
            'success': false,
            'message': 'This listing already has an active service',
            'code': 'LISTING_UNAVAILABLE',
          }));
      await expectLater(
        RequestRepository(rig.client).create(listingId: 'l1', issue: 'Broken'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'LISTING_UNAVAILABLE').having((e) => e.statusCode, 'status', 409)),
      );
    });
  });
}
