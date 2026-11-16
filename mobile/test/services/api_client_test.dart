import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:flutter_test/flutter_test.dart';

typedef _Call = ({String path, Map<String, dynamic> headers, Object? data});

/// A Dio adapter that answers from a function and remembers what it was asked (headers copied at the time of the call).
class _Adapter implements HttpClientAdapter {
  _Adapter(this.handler);

  final Future<ResponseBody> Function(RequestOptions options) handler;
  final calls = <_Call>[];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) {
    calls.add((path: options.path, headers: Map<String, dynamic>.of(options.headers), data: options.data));
    return handler(options);
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status, Object body) =>
    ResponseBody.fromString(jsonEncode(body), status, headers: {Headers.contentTypeHeader: [Headers.jsonContentType]});

const _expired = {'success': false, 'message': 'Your session has expired', 'code': 'TOKEN_EXPIRED'};

Map<String, Object> _tokens(String access, String refresh) => {
      'success': true,
      'data': {'accessToken': access, 'refreshToken': refresh, 'expiresIn': 900},
    };

class _Rig {
  _Rig({required Future<ResponseBody> Function(RequestOptions) api, required Future<ResponseBody> Function(RequestOptions) refresh})
      : apiAdapter = _Adapter(api),
        refreshAdapter = _Adapter(refresh),
        store = MemoryKeyValueStore() {
    final dio = Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = apiAdapter;
    final refreshDio = Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = refreshAdapter;
    client = ApiClient(store: store, dio: dio, refreshDio: refreshDio);
    client.onSessionExpired = () => expired = true;
  }

  final _Adapter apiAdapter;
  final _Adapter refreshAdapter;
  final MemoryKeyValueStore store;
  late final ApiClient client;
  bool expired = false;

  Future<void> signIn() => client.adoptSession(accessToken: 'old-access', refreshToken: 'r1');
}

/// The API answers 200 only for the new access token, and 401 for anything else.
Future<ResponseBody> _onlyNewToken(RequestOptions o) async {
  if (o.path == '/auth/me' && o.headers['Authorization'] == 'Bearer new-access') {
    return _json(200, {'success': true, 'data': {'ok': true}});
  }
  return _json(401, _expired);
}

Future<ResponseBody> _refreshOk(RequestOptions o) async {
  await Future<void>.delayed(const Duration(milliseconds: 20));
  return _json(200, _tokens('new-access', 'r2'));
}

void main() {
  group('headers', () {
    test('protected calls carry the mobile marker and the access token', () async {
      final rig = _Rig(api: (_) async => _json(200, {'success': true}), refresh: _refreshOk);
      await rig.signIn();
      await rig.client.dio.get<dynamic>('/auth/me');
      final headers = rig.apiAdapter.calls.single.headers;
      expect(headers['X-Client-Type'], 'mobile');
      expect(headers['Authorization'], 'Bearer old-access');
    });

    test('sign-in calls never carry the access token', () async {
      final rig = _Rig(api: (_) async => _json(200, {'success': true}), refresh: _refreshOk);
      await rig.signIn();
      await rig.client.dio.post<dynamic>('/auth/login', data: {'email': 'a@b.co', 'password': 'x'});
      final headers = rig.apiAdapter.calls.single.headers;
      expect(headers['X-Client-Type'], 'mobile');
      expect(headers['Authorization'], isNull);
    });
  });

  group('refresh', () {
    test('a 401 refreshes once, stores the rotated token and replays the call', () async {
      final rig = _Rig(api: _onlyNewToken, refresh: _refreshOk);
      await rig.signIn();

      final res = await rig.client.dio.get<dynamic>('/auth/me');

      expect(res.statusCode, 200);
      expect(rig.refreshAdapter.calls, hasLength(1));
      expect(rig.refreshAdapter.calls.single.data, {'refreshToken': 'r1'});
      expect(rig.apiAdapter.calls, hasLength(2));
      expect(rig.apiAdapter.calls.last.headers['Authorization'], 'Bearer new-access');
      expect(await rig.store.read(StoreKeys.refreshToken), 'r2');
      expect(rig.expired, isFalse);
    });

    test('calls that fail together share one refresh (single flight)', () async {
      final rig = _Rig(api: _onlyNewToken, refresh: _refreshOk);
      await rig.signIn();

      final results = await Future.wait([
        rig.client.dio.get<dynamic>('/auth/me'),
        rig.client.dio.get<dynamic>('/auth/me'),
        rig.client.dio.get<dynamic>('/auth/me'),
      ]);

      expect(results.map((r) => r.statusCode), everyElement(200));
      expect(rig.refreshAdapter.calls, hasLength(1), reason: 'a second refresh would be refused as token reuse');
      expect(rig.apiAdapter.calls, hasLength(6));
    });

    test('a call is replayed only once, so a persistent 401 does not loop', () async {
      final rig = _Rig(api: (_) async => _json(401, _expired), refresh: _refreshOk);
      await rig.signIn();

      await expectLater(rig.client.dio.get<dynamic>('/auth/me'), throwsA(isA<DioException>()));

      expect(rig.apiAdapter.calls, hasLength(2));
      expect(rig.refreshAdapter.calls, hasLength(1));
    });

    test('a refused refresh token ends the session', () async {
      final rig = _Rig(
        api: (_) async => _json(401, _expired),
        refresh: (_) async => _json(401, {'success': false, 'message': 'Invalid refresh token', 'code': 'TOKEN_REUSED'}),
      );
      await rig.signIn();

      await expectLater(rig.client.dio.get<dynamic>('/auth/me'), throwsA(isA<DioException>()));

      expect(rig.expired, isTrue);
      expect(rig.client.hasAccessToken, isFalse);
      expect(await rig.store.read(StoreKeys.refreshToken), isNull);
    });

    test('when the server cannot be reached the session is kept', () async {
      final rig = _Rig(api: (_) async => _json(401, _expired), refresh: (_) async => _json(503, {'success': false, 'message': 'down'}));
      await rig.signIn();

      await expectLater(rig.client.dio.get<dynamic>('/auth/me'), throwsA(isA<DioException>()));

      expect(rig.expired, isFalse);
      expect(rig.client.hasAccessToken, isTrue);
      expect(await rig.store.read(StoreKeys.refreshToken), 'r1');
    });

    test('a wrong password on the sign-in call is not treated as an expired session', () async {
      final rig = _Rig(api: (_) async => _json(401, {'success': false, 'message': 'Incorrect email or password'}), refresh: _refreshOk);

      await expectLater(rig.client.dio.post<dynamic>('/auth/login', data: {'email': 'a@b.co', 'password': 'x'}), throwsA(isA<DioException>()));

      expect(rig.refreshAdapter.calls, isEmpty);
      expect(rig.expired, isFalse);
    });

    test('without a saved refresh token the refresh is rejected', () async {
      final rig = _Rig(api: (_) async => _json(401, _expired), refresh: _refreshOk);
      expect(await rig.client.refresh(), RefreshOutcome.rejected);
      expect(rig.refreshAdapter.calls, isEmpty);
    });
  });

  test('clearSession forgets both tokens', () async {
    final rig = _Rig(api: (_) async => _json(200, {}), refresh: _refreshOk);
    await rig.signIn();
    await rig.client.clearSession();
    expect(rig.client.hasAccessToken, isFalse);
    expect(await rig.client.storedRefreshToken, isNull);
  });
}
