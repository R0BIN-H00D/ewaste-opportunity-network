import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/refurbishment_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import '../models/refurbishment_models_test.dart';

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


Future<ResponseBody> _job(RequestOptions o) async => _json(200, {'success': true, 'data': refurbJobJson(status: 'accepted')});

void main() {
  test('the feed sends only the filters that are set and reads paging', () async {
    final rig = _rig((o) async => _json(200, {
          'success': true,
          'data': [refurbOpportunityJson(), refurbOpportunityJson(id: 'l2', hasOffered: true)],
          'meta': {'page': 1, 'pages': 2, 'total': 14},
        }));
    final page = await RefurbishmentRepository(rig.client).opportunities(const RefurbOpportunityQuery(q: ' dell ', condition: 'fully_working'));

    expect(page.items.map((o) => o.id), ['l1', 'l2']);
    expect(page.items.last.hasOffered, isTrue);
    expect(page.pages, 2);
    final sent = rig.api.requests.single;
    expect(sent.path, '/refurbishment/opportunities');
    expect(sent.queryParameters['q'], 'dell');
    expect(sent.queryParameters['condition'], 'fully_working');
    expect(sent.queryParameters.containsKey('category'), isFalse);
  });

  test('the query counts its filters', () {
    expect(const RefurbOpportunityQuery().activeFilters, 0);
    expect(const RefurbOpportunityQuery().copyWith(category: 'laptops', condition: 'fully_working').activeFilters, 2);
  });

  test('an offer sends the amount and a trimmed message, and leaves out what is empty', () async {
    final rig = _rig(_job);
    final repo = RefurbishmentRepository(rig.client);
    await repo.makeOffer(listingId: 'l1', amount: 500, message: '  Hello  ');
    await repo.makeOffer(listingId: 'l1', message: '   ');
    expect(rig.api.requests[0].path, '/refurbishment/offers');
    expect(rig.api.requests[0].method, 'POST');
    expect(rig.api.requests[0].data, {'listingId': 'l1', 'amount': 500.0, 'message': 'Hello'});
    expect(rig.api.requests[1].data, {'listingId': 'l1'});
  });

  test('jobs ask for the side and status, and read one job', () async {
    final rig = _rig((o) async => o.path.endsWith('/jobs')
        ? _json(200, {'success': true, 'data': [refurbJobJson(detail: false)], 'meta': {'page': 1, 'pages': 1, 'total': 1}})
        : _json(200, {'success': true, 'data': refurbJobJson(status: 'accepted', actions: const ['cancel'])}));
    final repo = RefurbishmentRepository(rig.client);
    final page = await repo.jobs(as: 'owner', status: 'accepted');
    expect(page.items.single.id, 'j1');
    expect(rig.api.requests.single.queryParameters['as'], 'owner');
    expect(rig.api.requests.single.queryParameters['status'], 'accepted');
    final job = await repo.job('j1');
    expect(job.status, 'accepted');
    expect(rig.api.requests.last.path, '/refurbishment/jobs/j1');
  });

  test('deciding, withdrawing and cancelling use the right calls', () async {
    final rig = _rig(_job);
    final repo = RefurbishmentRepository(rig.client);
    await repo.decide('j1', accept: true);
    await repo.decide('j1', accept: false);
    await repo.withdraw('j1');
    await repo.cancel('j1', reason: ' no longer needed ');
    await repo.cancel('j1');
    final r = rig.api.requests;
    expect([r[0].method, r[0].path, r[0].data], ['PUT', '/refurbishment/jobs/j1/offer-decision', {'decision': 'accept'}]);
    expect(r[1].data, {'decision': 'reject'});
    expect([r[2].method, r[2].path], ['DELETE', '/refurbishment/jobs/j1/offer']);
    expect([r[3].path, r[3].data], ['/refurbishment/jobs/j1/cancel', {'reason': 'no longer needed'}]);
    expect(r[4].data, <String, dynamic>{});
  });

  test('the handover is scheduled in UTC and confirmed with the checklist flag only when ticked', () async {
    final rig = _rig(_job);
    final repo = RefurbishmentRepository(rig.client);
    await repo.scheduleHandover('j1', date: DateTime.utc(2026, 11, 20, 10), timeSlot: ' Morning ', notes: '');
    await repo.confirmHandover('j1');
    await repo.confirmHandover('j1', acknowledgeChecklist: true);
    final r = rig.api.requests;
    expect(r[0].path, '/refurbishment/jobs/j1/handover');
    expect(r[0].data, {'date': '2026-11-20T10:00:00.000Z', 'timeSlot': 'Morning'});
    expect(r[1].data, <String, dynamic>{});
    expect(r[2].data, {'acknowledgeChecklist': true});
  });

  test('moving a job on sends the next status and an optional note', () async {
    final rig = _rig(_job);
    final repo = RefurbishmentRepository(rig.client);
    await repo.advance('j1', status: 'assessment', note: ' Looks fine ');
    await repo.advance('j1', status: 'in_progress');
    expect(rig.api.requests[0].method, 'PUT');
    expect(rig.api.requests[0].path, '/refurbishment/jobs/j1/status');
    expect(rig.api.requests[0].data, {'status': 'assessment', 'note': 'Looks fine'});
    expect(rig.api.requests[1].data, {'status': 'in_progress'});
  });

  test('a refused action keeps the server code and message', () async {
    final rig = _rig((o) async => _json(409, {'success': false, 'message': 'This job was just changed. Reload the page and try again.', 'code': 'STALE_STATE'}));
    await expectLater(
      RefurbishmentRepository(rig.client).advance('j1', status: 'assessment'),
      throwsA(isA<ApiException>().having((e) => e.code, 'code', 'STALE_STATE').having((e) => e.failure, 'failure', ApiFailure.conflict)),
    );
  });

  test('an unverified refurbisher is told so', () async {
    final rig = _rig((o) async => _json(403, {'success': false, 'message': 'Your account must be verified by an administrator first.', 'code': 'NOT_VERIFIED'}));
    await expectLater(
      RefurbishmentRepository(rig.client).makeOffer(listingId: 'l1'),
      throwsA(isA<ApiException>().having((e) => e.code, 'code', 'NOT_VERIFIED').having((e) => e.failure, 'failure', ApiFailure.forbidden)),
    );
  });
}
