import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/routes/app_router.dart';
import 'package:flutter_test/flutter_test.dart';

String? _go(String location, {bool booted = true, AuthStatus auth = AuthStatus.unauthenticated, bool seen = true}) =>
    redirectFor(booted: booted, auth: auth, onboardingSeen: seen, location: location);

void main() {
  group('while starting up', () {
    test('everything goes to the splash screen', () {
      expect(_go(Routes.home, booted: false, auth: AuthStatus.unknown), Routes.splash);
      expect(_go(Routes.login, booted: false, auth: AuthStatus.unknown), Routes.splash);
      expect(_go(Routes.splash, booted: false, auth: AuthStatus.unknown), isNull);
    });

    test('an unknown session keeps the splash even after storage is read', () {
      expect(_go(Routes.home, auth: AuthStatus.unknown), Routes.splash);
    });
  });

  group('signed out', () {
    test('the splash leads to the introduction the first time, then to sign-in', () {
      expect(_go(Routes.splash, seen: false), Routes.onboarding);
      expect(_go(Routes.splash, seen: true), Routes.login);
    });

    test('public screens stay where they are', () {
      for (final path in publicRoutes) {
        expect(_go(path), isNull, reason: path);
      }
    });

    test('app screens go to sign-in', () {
      expect(_go(Routes.home), Routes.login);
      expect(_go(Routes.account), Routes.login);
    });
  });

  group('signed in', () {
    test('the splash and the sign-in screens go to home', () {
      expect(_go(Routes.splash, auth: AuthStatus.authenticated), Routes.home);
      expect(_go(Routes.login, auth: AuthStatus.authenticated), Routes.home);
      expect(_go(Routes.register, auth: AuthStatus.authenticated), Routes.home);
      expect(_go(Routes.onboarding, auth: AuthStatus.authenticated), Routes.home);
    });

    test('app screens stay where they are', () {
      expect(_go(Routes.home, auth: AuthStatus.authenticated), isNull);
      expect(_go(Routes.account, auth: AuthStatus.authenticated), isNull);
    });
  });
}
