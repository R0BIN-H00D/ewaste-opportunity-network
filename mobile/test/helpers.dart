import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/models/account.dart';
import 'package:ewaste_opportunity/models/page_result.dart';
import 'package:ewaste_opportunity/models/user.dart';
import 'package:ewaste_opportunity/services/account_repository.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/auth_repository.dart';

/// A user as the server sends it.
Map<String, dynamic> userJson(
        {String role = 'user',
        bool emailVerified = true,
        String name = 'Asha Rao',
        String status = 'active'}) =>
    {
      '_id': 'u1',
      'name': name,
      'email': 'asha@example.com',
      'role': role,
      'status': status,
      'emailVerified': emailVerified,
    };

Me sampleMe(
        {UserRole role = UserRole.user,
        bool emailVerified = true,
        String? verificationStatus}) =>
    Me(
      user: AppUser(
        id: 'u1',
        name: 'Asha Rao',
        email: 'asha@example.com',
        role: role,
        status: 'active',
        emailVerified: emailVerified,
      ),
      verificationStatus: verificationStatus,
    );

/// An [AccountRepository] that never touches the network and records what was asked of it.
class FakeAccountRepository extends AccountRepository {
  FakeAccountRepository(
      {this.profileResult = const OwnProfile(),
      this.notes = const [],
      this.paymentList = const [],
      this.summary = const PaymentSummary()})
      : super(ApiClient(store: MemoryKeyValueStore()));

  OwnProfile profileResult;
  List<NotificationItem> notes;
  List<PaymentRecord> paymentList;
  PaymentSummary summary;
  ApiException? error;
  final calls = <String>[];

  void _fail() {
    final e = error;
    if (e != null) throw e;
  }

  @override
  Future<OwnProfile> profile() async => profileResult;

  @override
  Future<AppUser> updateAccount({required String name, String? phone}) async {
    _fail();
    calls.add('account:$name:${phone ?? ''}');
    return AppUser(
        id: 'u1',
        name: name.trim(),
        email: 'asha@example.com',
        role: UserRole.user,
        status: 'active',
        emailVerified: true,
        phone: phone);
  }

  @override
  Future<OwnProfile> updateProfile(
      {String? bio,
      String? addressArea,
      String? city,
      String? state,
      String? pincode,
      double? lat,
      double? lng}) async {
    _fail();
    calls.add('profile:$addressArea:$city:$state:$pincode:$bio');
    return profileResult;
  }

  @override
  Future<OwnProfile> updatePreferences(
      {bool? emailNotifications,
      bool? pushNotifications,
      String? theme}) async {
    calls.add(
        'prefs:${emailNotifications ?? '-'}:${pushNotifications ?? '-'}:${theme ?? '-'}');
    return profileResult;
  }

  @override
  Future<({PageResult<NotificationItem> page, int unread})> notifications(
          {int page = 1, bool unreadOnly = false}) async =>
      (
        page: PageResult(items: notes, page: 1, pages: 1, total: notes.length),
        unread: notes.where((n) => !n.isRead).length
      );

  @override
  Future<int> unreadCount() async => notes.where((n) => !n.isRead).length;

  @override
  Future<void> markRead(String id) async {
    calls.add('read:$id');
    notes = [for (final n in notes) n.id == id ? n.markedRead() : n];
  }

  @override
  Future<void> markAllRead() async {
    calls.add('read-all');
    notes = [for (final n in notes) n.markedRead()];
  }

  @override
  Future<PageResult<PaymentRecord>> payments({int page = 1}) async =>
      PageResult(
          items: paymentList, page: 1, pages: 1, total: paymentList.length);

  @override
  Future<PaymentSummary> paymentSummary() async => summary;

  @override
  Future<void> contact(
      {required String name,
      required String email,
      required String subject,
      required String message}) async {
    _fail();
    calls.add('contact:$name:$email:$subject:$message');
  }
}

/// An [AuthRepository] that never touches the network.
class FakeAuthRepository extends AuthRepository {
  FakeAuthRepository(
      {this.loginResult,
      this.loginError,
      this.restoreResult,
      this.restoreError})
      : super(ApiClient(store: MemoryKeyValueStore()));

  Me? loginResult;
  ApiException? loginError;
  Me? restoreResult;
  ApiException? restoreError;

  final loginEmails = <String>[];
  bool loggedOut = false;

  /// The email-code step: the codes typed, whether the server refuses them, and how a resend is delivered.
  final codes = <String>[];
  ApiException? codeError;
  String delivery = 'smtp';
  int resends = 0;
  Me? meResult;

  @override
  Future<void> verifyEmailCode(String code) async {
    codes.add(code);
    final e = codeError;
    if (e != null) throw e;
  }

  @override
  Future<String> resendVerification() async {
    resends++;
    return delivery;
  }

  @override
  Future<Me> me() async => meResult ?? sampleMe();
  Map<String, Object?>? lastRegistration;

  @override
  Future<Me> login({required String email, required String password}) async {
    loginEmails.add(email);
    final error = loginError;
    if (error != null) throw error;
    return loginResult ?? sampleMe();
  }

  @override
  Future<Me> register({
    required String name,
    required String email,
    required String password,
    required UserRole role,
    String? phone,
    String? organizationName,
  }) async {
    lastRegistration = {
      'name': name,
      'email': email,
      'role': role,
      'phone': phone,
      'organizationName': organizationName
    };
    return sampleMe(role: role);
  }

  @override
  Future<Me?> restore() async {
    final error = restoreError;
    if (error != null) throw error;
    return restoreResult;
  }

  @override
  Future<void> logout() async {
    loggedOut = true;
  }
}
