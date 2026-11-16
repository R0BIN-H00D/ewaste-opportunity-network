import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/user.dart';
import 'api_client.dart';

Map<String, dynamic> _data(Response<dynamic> response) => ((response.data as Map)['data'] as Map).cast<String, dynamic>();

/// Everything about signing in and out. Every method either succeeds or throws an [ApiException].
class AuthRepository {
  AuthRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  Future<void> _adopt(Response<dynamic> response) async {
    final session = Session.fromJson(_data(response));
    await _api.adoptSession(accessToken: session.accessToken, refreshToken: session.refreshToken);
  }

  /// Signs in and returns what the app needs to start.
  Future<Me> login({required String email, required String password}) => guard(() async {
        final res = await _dio.post<dynamic>('/auth/login', data: {'email': email.trim(), 'password': password});
        await _adopt(res);
        return _fetchMe();
      });

  Future<Me> register({
    required String name,
    required String email,
    required String password,
    required UserRole role,
    String? phone,
    String? organizationName,
  }) =>
      guard(() async {
        final res = await _dio.post<dynamic>('/auth/register', data: {
          'name': name.trim(),
          'email': email.trim(),
          'password': password,
          'role': role.name,
          if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
          if (organizationName != null && organizationName.trim().isNotEmpty) 'organizationName': organizationName.trim(),
        });
        await _adopt(res);
        return _fetchMe();
      });

  /// Starts the app from the saved refresh token. `null` means there is nobody to restore (no token, or the server refused it).
  /// Throws an offline [ApiException] when the server cannot be reached, with the saved token kept for next time.
  Future<Me?> restore() => guard(() async {
        if (await _api.storedRefreshToken == null) return null;
        final outcome = await _api.refresh();
        if (outcome == RefreshOutcome.rejected) return null;
        if (outcome == RefreshOutcome.unavailable) throw ApiException.offline;
        return _fetchMe();
      });

  Future<Me> me() => guard(_fetchMe);

  Future<Me> _fetchMe() async {
    final res = await _dio.get<dynamic>('/auth/me');
    return Me.fromJson(_data(res));
  }

  /// Ends this device's session. The local tokens are removed even when the server cannot be reached.
  Future<void> logout() async {
    final token = await _api.storedRefreshToken;
    try {
      if (token != null) await _dio.post<dynamic>('/auth/logout', data: {'refreshToken': token});
    } on DioException {
      // The server forgets the session when the token expires; nothing more to do here.
    } finally {
      await _api.clearSession();
    }
  }

  Future<void> forgotPassword(String email) => guard(() async {
        await _dio.post<dynamic>('/auth/forgot-password', data: {'email': email.trim()});
      });

  Future<void> resetPassword({required String token, required String password}) => guard(() async {
        await _dio.post<dynamic>('/auth/reset-password', data: {'token': token.trim(), 'password': password});
      });

  Future<void> resendVerification() => guard(() async {
        await _dio.post<dynamic>('/auth/resend-verification');
      });
}
