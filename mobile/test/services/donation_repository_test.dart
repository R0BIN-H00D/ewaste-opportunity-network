import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/donation_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import '../models/donation_models_test.dart';

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

Future<ResponseBody> _donation(RequestOptions o) async => _json(200, {'success': true, 'data': donationJson(status: 'accepted', role: 'donor')});

void main() {
  group('the marketplace', () {
    test('list reads donations and paging, and sends only the filters that are set', () async {
      final rig = _rig((o) async => _json(200, {
            'success': true,
            'data': [donationJson(detail: false), donationJson(id: 'd2', detail: false)],
            'meta': {'page': 1, 'pages': 3, 'total': 30},
          }));
      final page = await DonationRepository(rig.client).donations(const DonationQuery(q: ' dell ', condition: 'fully_working'));

      expect(page.items.map((d) => d.id), ['d1', 'd2']);
      expect(page.pages, 3);
      expect(page.total, 30);
      final sent = rig.api.requests.single;
      expect(sent.path, '/donations');
      expect(sent.queryParameters['q'], 'dell');
      expect(sent.queryParameters['condition'], 'fully_working');
      expect(sent.queryParameters.containsKey('category'), isFalse);
      expect(sent.queryParameters.containsKey('as'), isFalse);
    });

    test('my own offers and the ones I asked for are separate scopes', () async {
      final rig = _rig((o) async => _json(200, {'success': true, 'data': <Object>[]}));
      final repo = DonationRepository(rig.client);
      await repo.donations(const DonationQuery(scope: 'donor'));
      await repo.donations(const DonationQuery(scope: 'recipient'));
      expect(rig.api.requests.map((r) => r.queryParameters['as']), ['donor', 'recipient']);
    });

    test('the query counts its filters and keeps the scope when a filter changes', () {
      expect(const DonationQuery().activeFilters, 0);
      final q = const DonationQuery(scope: 'donor').copyWith(category: 'laptops', condition: 'fully_working');
      expect(q.activeFilters, 2);
      expect(q.scope, 'donor');
    });

    test('one donation is read with its actions', () async {
      final rig = _rig((o) async => _json(200, {'success': true, 'data': donationJson(role: 'visitor', actions: ['request'])}));
      final d = await DonationRepository(rig.client).donation('d1');
      expect(rig.api.requests.single.path, '/donations/d1');
      expect(d.can('request'), isTrue);
    });
  });

  group('offering and asking', () {
    test('offering sends the listing and a trimmed note, or none', () async {
      final rig = _rig((o) async => _json(201, {'success': true, 'data': donationJson(role: 'donor')}));
      final repo = DonationRepository(rig.client);
      await repo.offer(listingId: 'l1', description: '  Charger included  ');
      await repo.offer(listingId: 'l1', description: '  ');
      expect(rig.api.requests[0].method, 'POST');
      expect(rig.api.requests[0].path, '/donations');
      expect(rig.api.requests[0].data, {'listingId': 'l1', 'description': 'Charger included'});
      expect(rig.api.requests[1].data, {'listingId': 'l1'});
    });

    test('asking sends why, and what for only when given; withdrawing deletes the request', () async {
      final rig = _rig((o) async => _json(200, {'success': true, 'data': donationJson(role: 'requester')}));
      final repo = DonationRepository(rig.client);
      await repo.request('d1', justification: ' We run a lab ', intendedUse: '');
      await repo.withdraw('d1');
      expect(rig.api.requests[0].path, '/donations/d1/request');
      expect(rig.api.requests[0].data, {'justification': 'We run a lab'});
      expect(rig.api.requests[1].method, 'DELETE');
      expect(rig.api.requests[1].path, '/donations/d1/request');
    });

    test('the donor accepts or declines one request', () async {
      final rig = _rig(_donation);
      final repo = DonationRepository(rig.client);
      await repo.decide('d1', 'r1', accept: true);
      await repo.decide('d1', 'r2', accept: false);
      expect(rig.api.requests.every((r) => r.method == 'PUT'), isTrue);
      expect(rig.api.requests[0].path, '/donations/d1/requests/r1/decision');
      expect(rig.api.requests[0].data, {'decision': 'accept'});
      expect(rig.api.requests[1].data, {'decision': 'reject'});
    });
  });

  group('handover, cancel and records', () {
    test('scheduling sends the time in UTC and leaves out empty text', () async {
      final rig = _rig(_donation);
      await DonationRepository(rig.client).scheduleHandover('d1', date: DateTime.utc(2026, 11, 20, 10), timeSlot: ' Morning ', notes: '');
      expect(rig.api.requests.single.path, '/donations/d1/handover');
      expect(rig.api.requests.single.data, {'date': '2026-11-20T10:00:00.000Z', 'timeSlot': 'Morning'});
    });

    test('confirming sends the checklist tick only when it was given', () async {
      final rig = _rig(_donation);
      final repo = DonationRepository(rig.client);
      await repo.confirmHandover('d1', acknowledgeChecklist: true);
      await repo.confirmHandover('d1');
      expect(rig.api.requests[0].path, '/donations/d1/confirm-handover');
      expect(rig.api.requests[0].data, {'acknowledgeChecklist': true});
      expect(rig.api.requests[1].data, <String, dynamic>{});
    });

    test('cancel sends the reason only when there is one', () async {
      final rig = _rig(_donation);
      final repo = DonationRepository(rig.client);
      await repo.cancel('d1', reason: ' Changed my mind ');
      await repo.cancel('d1');
      expect(rig.api.requests[0].path, '/donations/d1/cancel');
      expect(rig.api.requests[0].data, {'reason': 'Changed my mind'});
      expect(rig.api.requests[1].data, <String, dynamic>{});
    });

    test('the confirmation is read for a completed donation', () async {
      final rig = _rig((o) async => _json(200, {
            'success': true,
            'data': {
              'refNo': 'DON-2026-0001',
              'device': {'title': 'Old Dell laptop'},
              'donor': {'name': 'Ravi'},
              'recipient': {'name': 'Meena', 'orgName': 'Sunrise School'},
            },
          }));
      final c = await DonationRepository(rig.client).confirmation('d1');
      expect(rig.api.requests.single.path, '/donations/d1/confirmation');
      expect(c.refNo, 'DON-2026-0001');
    });

    test('the recipient status and the application', () async {
      final rig = _rig((o) async => _json(200, {'success': true, 'data': {'isOrg': true, 'orgName': 'Sunrise School', 'status': o.method == 'PUT' ? 'pending' : 'not_submitted'}}));
      final repo = DonationRepository(rig.client);
      expect((await repo.recipientStatus()).status, 'not_submitted');
      final applied = await repo.applyAsRecipient(orgType: 'school', orgName: ' Sunrise School ', registrationNo: ' REG-123 ');
      expect(applied.isPending, isTrue);
      expect(rig.api.requests[0].path, '/donations/recipient');
      expect(rig.api.requests[1].method, 'PUT');
      expect(rig.api.requests[1].data, {'orgType': 'school', 'orgName': 'Sunrise School', 'registrationNo': 'REG-123'});
    });

    test('a refusal becomes an ApiException with the server code', () async {
      final rig = _rig((o) async => _json(403, {'success': false, 'message': 'Only verified recipient organisations can request donations', 'code': 'NOT_VERIFIED'}));
      await expectLater(
        DonationRepository(rig.client).request('d1', justification: 'We run a computer lab'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'NOT_VERIFIED').having((e) => e.failure, 'failure', ApiFailure.forbidden)),
      );
    });
  });
}
