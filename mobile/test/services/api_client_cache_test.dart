import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/storage/response_cache.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:flutter_test/flutter_test.dart';

/// Answers from a function; the function can throw a [DioException] to act like a dead connection.
class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;
  int calls = 0;

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) {
    calls++;
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status, Object body) => ResponseBody.fromString(jsonEncode(body), status, headers: {
      Headers.contentTypeHeader: [Headers.jsonContentType],
    });

DioException _offline(RequestOptions o) => DioException(requestOptions: o, type: DioExceptionType.connectionError, error: 'no route to host');

class _Rig {
  _Rig(Future<ResponseBody> Function(RequestOptions) api, {DateTime? at})
      : adapter = _Adapter(api),
        store = MemoryKeyValueStore() {
    final dio = Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = adapter;
    final refreshDio = Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = _Adapter((o) async => throw _offline(o));
    cache = ResponseCache(store, clock: () => at ?? DateTime.utc(2026, 11, 16, 9, 30));
    client = ApiClient(store: store, dio: dio, refreshDio: refreshDio, cache: cache);
    client.onServedFromCache = (t) => served.add(t);
    client.onFreshData = () => fresh++;
  }

  final _Adapter adapter;
  final MemoryKeyValueStore store;
  late final ResponseCache cache;
  late final ApiClient client;
  final served = <DateTime>[];
  int fresh = 0;
  bool online = true;
}

Future<void> _settle() => Future<void>.delayed(const Duration(milliseconds: 20));

void main() {
  const devices = {'success': true, 'data': [{'_id': 'd1', 'title': 'Old laptop'}]};

  _Rig rig({DateTime? at}) {
    late _Rig r;
    r = _Rig((o) async {
      if (!r.online) throw _offline(o);
      return _json(200, devices);
    }, at: at);
    return r;
  }

  test('an answer is saved while online and served when the connection is gone', () async {
    final r = rig();
    r.client.useCacheFor('u1');
    final live = await r.client.dio.get<dynamic>('/devices', queryParameters: {'page': 1});
    expect(live.data, devices);
    expect(live.extra['fromCache'], isNot(true));
    expect(r.fresh, 1);
    await _settle();

    r.online = false;
    final saved = await r.client.dio.get<dynamic>('/devices', queryParameters: {'page': 1});
    expect(saved.statusCode, 200);
    expect(saved.data, devices);
    expect(saved.extra['fromCache'], true);
    expect(r.served, [DateTime.utc(2026, 11, 16, 9, 30)]);
  });

  test('a time-out is treated like a lost connection', () async {
    final r = _Rig((o) async {
      if (o.extra['slow'] == true) throw DioException(requestOptions: o, type: DioExceptionType.receiveTimeout);
      return _json(200, devices);
    });
    r.client.useCacheFor('u1');
    await r.client.dio.get<dynamic>('/devices');
    await _settle();
    final res = await r.client.dio.get<dynamic>('/devices', options: Options(extra: {'slow': true}));
    expect(res.extra['fromCache'], true);
  });

  test('a different filter has nothing saved, so the failure stays a failure', () async {
    final r = rig();
    r.client.useCacheFor('u1');
    await r.client.dio.get<dynamic>('/devices', queryParameters: {'page': 1});
    await _settle();
    r.online = false;
    await expectLater(r.client.dio.get<dynamic>('/devices', queryParameters: {'page': 2}), throwsA(isA<DioException>()));
    expect(r.served, isEmpty);
  });

  test('paths that are not on the list are never saved or served', () async {
    final r = rig();
    r.client.useCacheFor('u1');
    await r.client.dio.get<dynamic>('/service-requests/r1');
    await _settle();
    r.online = false;
    await expectLater(r.client.dio.get<dynamic>('/service-requests/r1'), throwsA(isA<DioException>()));
    expect(r.served, isEmpty);
  });

  test('posting is never answered from saved data', () async {
    final r = rig();
    r.client.useCacheFor('u1');
    await r.client.dio.get<dynamic>('/devices');
    await _settle();
    r.online = false;
    await expectLater(r.client.dio.post<dynamic>('/devices', data: {'title': 'x'}), throwsA(isA<DioException>()));
  });

  test('nothing is saved before someone is signed in', () async {
    final r = rig();
    await r.client.dio.get<dynamic>('/devices');
    await _settle();
    r.online = false;
    await expectLater(r.client.dio.get<dynamic>('/devices'), throwsA(isA<DioException>()));
  });

  test('another person on the same phone cannot see what the first one saved', () async {
    final r = rig();
    r.client.useCacheFor('u1');
    await r.client.dio.get<dynamic>('/devices');
    await _settle();
    r.client.useCacheFor('u2');
    r.online = false;
    await expectLater(r.client.dio.get<dynamic>('/devices'), throwsA(isA<DioException>()));
  });

  test('ending the session wipes what was saved', () async {
    final r = rig();
    r.client.useCacheFor('u1');
    await r.client.dio.get<dynamic>('/devices');
    await _settle();
    await r.client.endCacheSession();
    r.client.useCacheFor('u1');
    r.online = false;
    await expectLater(r.client.dio.get<dynamic>('/devices'), throwsA(isA<DioException>()));
  });

  test('an answer from the server, even an error, is never replaced by saved data', () async {
    var status = 200;
    final r = _Rig((o) async => _json(status, status == 200 ? devices : {'success': false, 'message': 'Server error', 'code': 'SERVER_ERROR'}));
    r.client.useCacheFor('u1');
    await r.client.dio.get<dynamic>('/devices');
    await _settle();
    status = 500;
    await expectLater(r.client.dio.get<dynamic>('/devices'), throwsA(isA<DioException>().having((e) => e.response?.statusCode, 'status', 500)));
    expect(r.served, isEmpty);
  });

  test('a failed answer does not overwrite the saved one', () async {
    var status = 200;
    final r = _Rig((o) async {
      if (status == -1) throw _offline(o);
      return _json(status, status == 200 ? devices : {'success': false, 'message': 'no', 'code': 'X'});
    });
    r.client.useCacheFor('u1');
    await r.client.dio.get<dynamic>('/devices');
    await _settle();
    status = 404;
    await expectLater(r.client.dio.get<dynamic>('/devices'), throwsA(isA<DioException>()));
    status = -1;
    final res = await r.client.dio.get<dynamic>('/devices');
    expect(res.data, devices);
  });

  test('saved data is not counted as fresh', () async {
    final r = rig();
    r.client.useCacheFor('u1');
    await r.client.dio.get<dynamic>('/devices');
    await _settle();
    final before = r.fresh;
    r.online = false;
    await r.client.dio.get<dynamic>('/devices');
    expect(r.fresh, before);
  });
}
