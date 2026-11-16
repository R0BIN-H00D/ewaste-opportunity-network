import 'dart:async';
import 'package:dio/dio.dart';
import '../core/constants/app_constants.dart';
import '../core/storage/key_value_store.dart';

/// How a token refresh ended.
/// - [refreshed]: new tokens are in place.
/// - [rejected]: the server refused the refresh token, so the person must sign in again.
/// - [unavailable]: the server could not be reached; keep the tokens and try again later.
enum RefreshOutcome { refreshed, rejected, unavailable }

const _publicAuthPaths = {
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/logout',
  '/auth/forgot-password',
  '/auth/reset-password',
  '/auth/verify-email',
};

Dio _newDio(String? baseUrl) => Dio(
      BaseOptions(
        baseUrl: baseUrl ?? AppConstants.apiBaseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 20),
        headers: {'Accept': 'application/json'},
      ),
    );

/// The single door to the shared backend.
///
/// - Every request says it is the mobile app (`X-Client-Type: mobile`), so the server returns the refresh token in the JSON body.
/// - The access token lives in memory only; the refresh token lives in secure storage.
/// - A `401` on a protected call refreshes the session once (single-flight: any number of calls that fail together share one
///   refresh) and replays the call. If the server refuses the refresh token, [onSessionExpired] runs.
class ApiClient {
  ApiClient({required KeyValueStore store, Dio? dio, Dio? refreshDio, String? baseUrl})
      : _store = store,
        dio = dio ?? _newDio(baseUrl),
        _refreshDio = refreshDio ?? _newDio(baseUrl) {
    this.dio.interceptors.add(InterceptorsWrapper(onRequest: _onRequest, onError: _onError));
  }

  final Dio dio;
  final Dio _refreshDio; // no interceptors, so a refresh can never trigger a refresh
  final KeyValueStore _store;

  String? _accessToken;
  Future<RefreshOutcome>? _refreshing;

  /// Called once the server has refused the refresh token. Set by the auth controller.
  void Function()? onSessionExpired;

  bool get hasAccessToken => _accessToken != null;

  Future<String?> get storedRefreshToken => _store.read(StoreKeys.refreshToken);

  Future<void> adoptSession({required String accessToken, required String refreshToken}) async {
    _accessToken = accessToken;
    await _store.write(StoreKeys.refreshToken, refreshToken);
  }

  Future<void> clearSession() async {
    _accessToken = null;
    await _store.delete(StoreKeys.refreshToken);
  }

  /// Shares one refresh between all callers that need it at the same moment.
  Future<RefreshOutcome> refresh() => _refreshing ??= _doRefresh().whenComplete(() => _refreshing = null);

  Future<RefreshOutcome> _doRefresh() async {
    final token = await _store.read(StoreKeys.refreshToken);
    if (token == null) return RefreshOutcome.rejected;
    try {
      final res = await _refreshDio.post<dynamic>(
        '/auth/refresh',
        data: {'refreshToken': token},
        options: Options(headers: {'X-Client-Type': 'mobile'}),
      );
      final data = ((res.data as Map)['data'] as Map).cast<String, dynamic>();
      await adoptSession(accessToken: data['accessToken'] as String, refreshToken: data['refreshToken'] as String);
      return RefreshOutcome.refreshed;
    } on DioException catch (e) {
      final status = e.response?.statusCode;
      if (status == 400 || status == 401 || status == 403 || status == 422) {
        await clearSession();
        return RefreshOutcome.rejected;
      }
      return RefreshOutcome.unavailable;
    } catch (_) {
      return RefreshOutcome.unavailable;
    }
  }

  bool _isPublic(String path) {
    final p = path.startsWith('/') ? path : '/$path';
    return _publicAuthPaths.contains(p);
  }

  void _onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.headers['X-Client-Type'] = 'mobile';
    final token = _accessToken;
    if (token != null && !_isPublic(options.path) && options.headers['Authorization'] == null) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  Future<void> _onError(DioException err, ErrorInterceptorHandler handler) async {
    final request = err.requestOptions;
    if (err.response?.statusCode != 401 || request.extra['retried'] == true || _isPublic(request.path)) {
      return handler.next(err);
    }

    // A call that was sent with an older token than the one we hold now only needs replaying, not another refresh.
    final current = _accessToken;
    final alreadyRefreshed = current != null && request.headers['Authorization'] != 'Bearer $current';
    final outcome = alreadyRefreshed ? RefreshOutcome.refreshed : await refresh();

    if (outcome == RefreshOutcome.refreshed) {
      try {
        request.extra['retried'] = true;
        request.headers['Authorization'] = 'Bearer $_accessToken';
        // A form that has been sent once cannot be sent again; replay a fresh copy (matters for photo uploads).
        final body = request.data;
        if (body is FormData) request.data = body.clone();
        return handler.resolve(await dio.fetch<dynamic>(request));
      } on DioException catch (retryError) {
        return handler.next(retryError);
      }
    }
    if (outcome == RefreshOutcome.rejected) onSessionExpired?.call();
    handler.next(err);
  }
}
