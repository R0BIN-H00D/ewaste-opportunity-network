import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/learning_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import '../models/learning_models_test.dart';

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

Future<ResponseBody> _application(RequestOptions o) async => _json(200, {'success': true, 'data': applicationJson(status: 'accepted', actions: const [])});

void main() {
  group('opportunities', () {
    test('list reads tasks and paging, and sends only the filters that are set', () async {
      final rig = _rig((o) async => _json(200, {
            'success': true,
            'data': [opportunityJson(), opportunityJson(id: 'o2')],
            'meta': {'page': 1, 'pages': 2, 'total': 14},
          }));
      final page = await LearningRepository(rig.client).opportunities(const OpportunityQuery(q: ' battery ', difficulty: 'beginner'));

      expect(page.items.map((o) => o.id), ['o1', 'o2']);
      expect(page.pages, 2);
      final sent = rig.api.requests.single;
      expect(sent.path, '/students/opportunities');
      expect(sent.queryParameters['q'], 'battery');
      expect(sent.queryParameters['difficulty'], 'beginner');
      expect(sent.queryParameters.containsKey('category'), isFalse);
    });

    test('the query counts its filters', () {
      expect(const OpportunityQuery().activeFilters, 0);
      expect(const OpportunityQuery(difficulty: 'beginner', category: 'phones').activeFilters, 2);
    });

    test('one task is read with whether the student can apply', () async {
      final rig = _rig((o) async => _json(200, {'success': true, 'data': opportunityJson(applyBlock: 'filled')}));
      final o = await LearningRepository(rig.client).opportunity('o1');
      expect(rig.api.requests.single.path, '/students/opportunities/o1');
      expect(o.applyBlock, 'filled');
    });
  });

  group('applications', () {
    test('applying sends the task and a trimmed note, or none', () async {
      final rig = _rig((o) async => _json(201, {'success': true, 'data': applicationJson()}));
      final repo = LearningRepository(rig.client);
      await repo.apply('o1', message: '  I like fixing phones ');
      await repo.apply('o1', message: '');
      expect(rig.api.requests[0].method, 'POST');
      expect(rig.api.requests[0].path, '/students/applications');
      expect(rig.api.requests[0].data, {'opportunityId': 'o1', 'message': 'I like fixing phones'});
      expect(rig.api.requests[1].data, {'opportunityId': 'o1'});
    });

    test('the list asks for a status only when one is chosen', () async {
      final rig = _rig((o) async => _json(200, {'success': true, 'data': [applicationJson()], 'meta': {'page': 2, 'pages': 3, 'total': 25}}));
      final repo = LearningRepository(rig.client);
      final page = await repo.applications(status: 'accepted', page: 2);
      await repo.applications(status: '');
      expect(rig.api.requests[0].queryParameters['status'], 'accepted');
      expect(rig.api.requests[0].queryParameters['page'], 2);
      expect(rig.api.requests[1].queryParameters.containsKey('status'), isFalse);
      expect(page.items.single.id, 'a1');
      expect(page.pages, 3);
    });

    test('one application, and withdrawing it with or without a reason', () async {
      final rig = _rig(_application);
      final repo = LearningRepository(rig.client);
      await repo.application('a1');
      await repo.withdraw('a1', reason: ' No time ');
      await repo.withdraw('a1');
      expect(rig.api.requests[0].path, '/students/applications/a1');
      expect(rig.api.requests[1].method, 'POST');
      expect(rig.api.requests[1].path, '/students/applications/a1/withdraw');
      expect(rig.api.requests[1].data, {'reason': 'No time'});
      expect(rig.api.requests[2].data, <String, dynamic>{});
    });

    test('a refusal becomes an ApiException with the server code', () async {
      final rig = _rig((o) async => _json(403, {'success': false, 'message': 'Your student account must be verified by an administrator first', 'code': 'NOT_VERIFIED'}));
      await expectLater(
        LearningRepository(rig.client).apply('o1'),
        throwsA(isA<ApiException>().having((e) => e.code, 'code', 'NOT_VERIFIED').having((e) => e.failure, 'failure', ApiFailure.forbidden)),
      );
    });
  });

  group('experience and certificates', () {
    test('the experience and the certificates are read', () async {
      final rig = _rig((o) async => _json(200, {
            'success': true,
            'data': o.path == '/students/experience'
                ? {'summary': {'completedCount': 1, 'totalHours': 3.5}, 'items': [applicationJson(status: 'completed', actions: const [], hours: 3.5)]}
                : [
                    {'_id': 'c1', 'certNo': 'CERT-2026-AB12CD', 'application': {'hours': 3.5, 'opportunity': {'title': 'Replace a phone battery'}}},
                  ],
          }));
      final repo = LearningRepository(rig.client);
      final x = await repo.experience();
      final certs = await repo.certificates();
      expect(x.summary.totalHours, 3.5);
      expect(x.items.single.status, 'completed');
      expect(certs.single.certNo, 'CERT-2026-AB12CD');
      expect(certs.single.taskTitle, 'Replace a phone battery');
    });
  });

  group('the supervising technician', () {
    test('my tasks ask for a status, and posting sends the promise and UTC deadline', () async {
      final rig = _rig((o) async => o.method == 'GET'
          ? _json(200, {'success': true, 'data': [opportunityJson(viewerRole: 'supervisor')], 'meta': {'page': 1, 'pages': 1, 'total': 1}})
          : _json(201, {'success': true, 'data': opportunityJson(viewerRole: 'supervisor')}));
      final repo = LearningRepository(rig.client);
      await repo.myOpportunities(status: 'open');
      expect(rig.api.requests.single.path, '/students/opportunities/mine');
      expect(rig.api.requests.single.queryParameters['status'], 'open');

      await repo.createOpportunity(OpportunityInput(
        title: ' Replace a phone battery ',
        description: '',
        deviceTypeId: 'c1',
        requiredSkills: const ['soldering'],
        difficulty: 'beginner',
        locationArea: ' Indiranagar ',
        deadline: DateTime.utc(2026, 12, 1, 18),
        seats: 2,
        supervisionAcknowledged: true,
      ));
      final post = rig.api.requests.last;
      expect(post.method, 'POST');
      expect(post.path, '/students/opportunities');
      final body = post.data as Map<String, dynamic>;
      expect(body['title'], 'Replace a phone battery');
      expect(body.containsKey('description'), isFalse);
      expect(body['deadline'], '2026-12-01T18:00:00.000Z');
      expect(body['supervisionAcknowledged'], isTrue);
      expect(body['locationArea'], 'Indiranagar');
    });

    test('editing leaves out the promise; closing and opening send the status', () async {
      final rig = _rig((o) async => _json(200, {'success': true, 'data': opportunityJson(viewerRole: 'supervisor')}));
      final repo = LearningRepository(rig.client);
      await repo.updateOpportunity('o1', const OpportunityInput(seats: 3));
      await repo.setOpportunityOpen('o1', open: false);
      await repo.setOpportunityOpen('o1', open: true);
      final r = rig.api.requests;
      expect([r[0].method, r[0].path, r[0].data], ['PUT', '/students/opportunities/o1', {'seats': 3}]);
      expect([r[1].path, r[1].data], ['/students/opportunities/o1/status', {'status': 'closed'}]);
      expect(r[2].data, {'status': 'open'});
    });

    test('applicants, decisions, start and completion use the right calls', () async {
      final rig = _rig((o) async => o.path.endsWith('/applications') && o.method == 'GET'
          ? _json(200, {'success': true, 'data': [applicationJson()], 'meta': {'page': 1, 'pages': 1, 'total': 1}})
          : _json(200, {'success': true, 'data': applicationJson(status: 'accepted')}));
      final repo = LearningRepository(rig.client);
      final page = await repo.applicants('o1', status: 'applied');
      expect(page.items.single.id, 'a1');
      expect(rig.api.requests.single.path, '/students/opportunities/o1/applications');
      expect(rig.api.requests.single.queryParameters['status'], 'applied');

      await repo.decide('a1', accept: true, feedback: ' Welcome ');
      await repo.decide('a1', accept: false);
      await repo.start('a1');
      await repo.complete('a1', hours: 3.5, feedback: 'Careful');
      final r = rig.api.requests;
      expect([r[1].method, r[1].path, r[1].data], ['PUT', '/students/applications/a1/decision', {'decision': 'accepted', 'feedback': 'Welcome'}]);
      expect(r[2].data, {'decision': 'rejected'});
      expect([r[3].method, r[3].path], ['POST', '/students/applications/a1/start']);
      expect([r[4].method, r[4].path, r[4].data], ['PUT', '/students/applications/a1/complete', {'hours': 3.5, 'feedback': 'Careful'}]);
    });
  });

  group('certificate PDF', () {
    test('returns the file bytes and the name the server gave', () async {
      final rig = _rig((o) async => ResponseBody.fromBytes(
            [37, 80, 68, 70, 45],
            200,
            headers: {
              Headers.contentTypeHeader: ['application/pdf'],
              'content-disposition': ['attachment; filename="certificate-CERT-2026-AB12CD.pdf"'],
            },
          ));
      final file = await LearningRepository(rig.client).certificatePdf('c1');
      expect(file.bytes, [37, 80, 68, 70, 45]);
      expect(file.filename, 'certificate-CERT-2026-AB12CD.pdf');
      expect(rig.api.requests.single.path, '/students/certificates/c1/pdf');
      expect(rig.api.requests.single.responseType, ResponseType.bytes);
    });

    test('falls back to a plain name, and turns a server error into an ApiException', () async {
      final ok = _rig((o) async => ResponseBody.fromBytes([1], 200, headers: {Headers.contentTypeHeader: ['application/pdf']}));
      expect((await LearningRepository(ok.client).certificatePdf('c1')).filename, 'certificate.pdf');
      final gone = _rig((o) async => ResponseBody.fromBytes(utf8.encode(jsonEncode({'success': false, 'message': 'Certificate not found', 'code': 'NOT_FOUND'})), 404, headers: {Headers.contentTypeHeader: [Headers.jsonContentType]}));
      await expectLater(LearningRepository(gone.client).certificatePdf('c1'), throwsA(isA<ApiException>().having((e) => e.statusCode, 'statusCode', 404)));
    });
  });}
