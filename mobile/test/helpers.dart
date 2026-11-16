import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/models/user.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/auth_repository.dart';

/// A user as the server sends it.
Map<String, dynamic> userJson({String role = 'user', bool emailVerified = true, String name = 'Asha Rao', String status = 'active'}) => {
      '_id': 'u1',
      'name': name,
      'email': 'asha@example.com',
      'role': role,
      'status': status,
      'emailVerified': emailVerified,
    };

Me sampleMe({UserRole role = UserRole.user, bool emailVerified = true, int? greenScore, String? verificationStatus}) => Me(
      user: AppUser(
        id: 'u1',
        name: 'Asha Rao',
        email: 'asha@example.com',
        role: role,
        status: 'active',
        emailVerified: emailVerified,
      ),
      greenScore: greenScore,
      verificationStatus: verificationStatus,
    );

/// An [AuthRepository] that never touches the network.
class FakeAuthRepository extends AuthRepository {
  FakeAuthRepository({this.loginResult, this.loginError, this.restoreResult, this.restoreError})
      : super(ApiClient(store: MemoryKeyValueStore()));

  Me? loginResult;
  ApiException? loginError;
  Me? restoreResult;
  ApiException? restoreError;

  final loginEmails = <String>[];
  bool loggedOut = false;
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
    lastRegistration = {'name': name, 'email': email, 'role': role, 'phone': phone, 'organizationName': organizationName};
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
