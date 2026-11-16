import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/account.dart';
import '../models/page_result.dart';
import '../models/user.dart';
import 'api_client.dart';

/// The signed-in person's own things: account and profile details, notifications, payment history and the help form.
class AccountRepository {
  AccountRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  Map<String, dynamic> _data(Response<dynamic> res) => ((res.data as Map)['data'] as Map).cast<String, dynamic>();

  PageResult<T> _page<T>(Response<dynamic> res, T Function(Map<String, dynamic>) read, int page) {
    final body = (res.data as Map).cast<String, dynamic>();
    final items = [for (final raw in body['data'] as List) read((raw as Map).cast<String, dynamic>())];
    final meta = body['meta'] is Map ? (body['meta'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    return PageResult(
      items: items,
      page: (meta['page'] as num?)?.toInt() ?? page,
      pages: (meta['pages'] as num?)?.toInt() ?? 1,
      total: (meta['total'] as num?)?.toInt() ?? items.length,
    );
  }

  Future<OwnProfile> profile() => guard(() async => OwnProfile.fromJson(_data(await _dio.get<dynamic>('/users/me/profile'))));

  /// Name and phone live on the account; an empty phone removes it.
  Future<AppUser> updateAccount({required String name, String? phone}) => guard(() async {
        final number = phone?.trim() ?? '';
        final res = await _dio.patch<dynamic>('/users/me', data: {'name': name.trim(), 'phone': number.isEmpty ? null : number});
        return AppUser.fromJson(_data(res));
      });

  Future<OwnProfile> updateProfile({String? bio, String? addressArea, String? city, String? state, String? pincode}) => guard(() async {
        final res = await _dio.patch<dynamic>('/users/me/profile', data: {
          if (bio != null) 'bio': bio.trim(),
          if (addressArea != null) 'addressArea': addressArea.trim(),
          if (city != null) 'city': city.trim(),
          if (state != null) 'state': state.trim(),
          if (pincode != null) 'pincode': pincode.trim(),
        });
        return OwnProfile.fromJson(_data(res));
      });

  Future<OwnProfile> updatePreferences({bool? emailNotifications, bool? pushNotifications, String? theme}) => guard(() async {
        final res = await _dio.patch<dynamic>('/users/me/profile', data: {
          'preferences': {
            if (emailNotifications != null) 'emailNotifications': emailNotifications,
            if (pushNotifications != null) 'pushNotifications': pushNotifications,
            if (theme != null) 'theme': theme,
          },
        });
        return OwnProfile.fromJson(_data(res));
      });

  /// One page of notifications plus the unread count from the same answer.
  Future<({PageResult<NotificationItem> page, int unread})> notifications({int page = 1, bool unreadOnly = false}) => guard(() async {
        final res = await _dio.get<dynamic>('/notifications', queryParameters: {'page': page, 'limit': 20, if (unreadOnly) 'unread': 'true'});
        final meta = (res.data as Map)['meta'];
        return (page: _page(res, NotificationItem.fromJson, page), unread: meta is Map ? (meta['unread'] as num?)?.toInt() ?? 0 : 0);
      });

  Future<int> unreadCount() => guard(() async => (_data(await _dio.get<dynamic>('/notifications/unread-count'))['unread'] as num?)?.toInt() ?? 0);

  Future<void> markRead(String id) => guard(() async {
        await _dio.put<dynamic>('/notifications/$id/read');
      });

  Future<void> markAllRead() => guard(() async {
        await _dio.put<dynamic>('/notifications/read-all');
      });

  Future<PageResult<PaymentRecord>> payments({int page = 1}) =>
      guard(() async => _page(await _dio.get<dynamic>('/transactions', queryParameters: {'page': page, 'limit': 10}), PaymentRecord.fromJson, page));

  Future<PaymentSummary> paymentSummary() => guard(() async => PaymentSummary.fromJson(_data(await _dio.get<dynamic>('/transactions/summary'))));

  /// The help form. The support team answers by email.
  Future<void> contact({required String name, required String email, required String subject, required String message}) => guard(() async {
        await _dio.post<dynamic>('/contact', data: {'name': name.trim(), 'email': email.trim(), 'subject': subject.trim(), 'message': message.trim()});
      });
}
