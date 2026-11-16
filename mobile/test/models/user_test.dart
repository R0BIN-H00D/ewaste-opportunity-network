import 'package:ewaste_opportunity/models/user.dart';
import 'package:flutter_test/flutter_test.dart';
import '../helpers.dart';

void main() {
  group('roles', () {
    test('roleFrom reads the API names and defaults to a member', () {
      expect(roleFrom('technician'), UserRole.technician);
      expect(roleFrom('recycler'), UserRole.recycler);
      expect(roleFrom('admin'), UserRole.admin);
      expect(roleFrom('somethingNew'), UserRole.user);
      expect(roleFrom(null), UserRole.user);
    });

    test('provider roles are the four that need approval', () {
      expect(UserRole.values.where((r) => r.isProvider), [UserRole.technician, UserRole.student, UserRole.refurbisher, UserRole.recycler]);
    });

    test('only refurbishers and recyclers give an organisation name', () {
      expect(UserRole.values.where((r) => r.needsOrganization), [UserRole.refurbisher, UserRole.recycler]);
    });

    test('administrators cannot register in the app', () {
      expect(registrationRoles, isNot(contains(UserRole.admin)));
      expect(registrationRoles, hasLength(5));
    });

    test('every role has a label and a blurb', () {
      for (final role in UserRole.values) {
        expect(role.label, isNotEmpty);
        expect(role.blurb, isNotEmpty);
      }
    });
  });

  group('AppUser', () {
    test('reads the server shape', () {
      final user = AppUser.fromJson({...userJson(role: 'technician'), 'phone': '+911234567890', 'avatar': {'url': 'https://img/a.png'}});
      expect(user.id, 'u1');
      expect(user.role, UserRole.technician);
      expect(user.phone, '+911234567890');
      expect(user.avatarUrl, 'https://img/a.png');
      expect(user.emailVerified, isTrue);
    });

    test('copes with missing optional fields', () {
      final user = AppUser.fromJson({'_id': 'u2'});
      expect(user.name, '');
      expect(user.role, UserRole.user);
      expect(user.status, 'active');
      expect(user.emailVerified, isFalse);
      expect(user.avatarUrl, isNull);
    });

    test('firstName and pending status', () {
      expect(AppUser.fromJson(userJson(name: '  Asha   Rao ')).firstName, 'Asha');
      expect(AppUser.fromJson(userJson(status: 'pending_verification')).isPendingVerification, isTrue);
    });
  });

  group('Session', () {
    test('needs a refresh token (the mobile contract)', () {
      expect(
        () => Session.fromJson({'user': userJson(), 'accessToken': 'a', 'expiresIn': 900}),
        throwsA(isA<FormatException>()),
      );
    });

    test('reads a full session', () {
      final session = Session.fromJson({'user': userJson(), 'accessToken': 'a', 'refreshToken': 'r', 'expiresIn': 900});
      expect(session.accessToken, 'a');
      expect(session.refreshToken, 'r');
      expect(session.expiresIn, 900);
      expect(session.user.email, 'asha@example.com');
    });
  });

  group('Me', () {
    test('reads the Green Score and verification status', () {
      final me = Me.fromJson({
        'user': userJson(role: 'technician'),
        'profile': {'greenScore': 42},
        'verification': {'status': 'pending'},
      });
      expect(me.greenScore, 42);
      expect(me.verificationStatus, 'pending');
    });

    test('both are optional', () {
      final me = Me.fromJson({'user': userJson()});
      expect(me.greenScore, isNull);
      expect(me.verificationStatus, isNull);
    });

    test('copyWith replaces the user only', () {
      final me = sampleMe(greenScore: 7, verificationStatus: 'approved');
      final changed = me.copyWith(user: sampleMe(role: UserRole.recycler).user);
      expect(changed.user.role, UserRole.recycler);
      expect(changed.greenScore, 7);
      expect(changed.verificationStatus, 'approved');
    });
  });
}
