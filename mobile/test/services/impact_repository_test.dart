import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/impact_repository.dart';
import 'package:flutter_test/flutter_test.dart';
import '../fakes.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(RequestOptions options,
      Stream<Uint8List>? requestStream, Future<void>? cancelFuture) {
    requests.add(options);
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status, Object body) =>
    ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType]
    });

({ImpactRepository repo, _Adapter api}) _rig(
    Future<ResponseBody> Function(RequestOptions) handler) {
  final adapter = _Adapter(handler);
  final client = ApiClient(
    store: MemoryKeyValueStore(),
    dio: Dio(BaseOptions(baseUrl: 'http://test/api'))
      ..httpClientAdapter = adapter,
    refreshDio: Dio(BaseOptions(baseUrl: 'http://test/api'))
      ..httpClientAdapter = _Adapter((_) async => _json(500, {})),
  );
  return (repo: ImpactRepository(client), api: adapter);
}

void main() {
  test('summary reads the person\'s own impact', () async {
    final rig =
        _rig((_) async => _json(200, {'success': true, 'data': impactJson()}));
    final s = await rig.repo.summary();
    expect([s.devicesTotal, s.measuredKg, s.estimatedKg], [3, 1.5, 2.0]);
    expect(rig.api.requests.single.path, '/analytics/user-impact');
  });

  test('monthly asks for my own months, and returns them oldest first',
      () async {
    final rig = _rig((_) async => _json(200, {
          'success': true,
          'data': {'months': FakeImpactRepository.defaultMonths()}
        }));
    final months = await rig.repo.monthly(months: 3);

    expect(months.map((m) => m.month), ['2026-09', '2026-10', '2026-11']);
    expect(
        rig.api.requests.single.queryParameters, {'scope': 'me', 'months': 3});
  });

  test('a refusal comes back as an error with the server\'s message', () async {
    final rig = _rig((_) async => _json(401, {
          'success': false,
          'message': 'Authentication required',
          'code': 'UNAUTHORIZED'
        }));
    await expectLater(
        rig.repo.summary(),
        throwsA(
            isA<ApiException>().having((e) => e.statusCode, 'status', 401)));
  });

  test('a missing list becomes an empty one', () async {
    final rig = _rig((_) async => _json(200, {'success': true, 'data': {}}));
    expect(await rig.repo.monthly(), isEmpty);
  });
}
