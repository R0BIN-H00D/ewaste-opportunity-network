import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/routes/app_router.dart';
import 'package:flutter_test/flutter_test.dart';

String? _go(String location, {bool booted = true, AuthStatus auth = AuthStatus.unauthenticated, bool seen = true, bool welcome = false, bool locked = false}) =>
    redirectFor(booted: booted, auth: auth, onboardingSeen: seen, location: location, welcome: welcome, locked: locked);

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

    test('a person who has just signed up lands on their profile first', () {
      expect(_go(Routes.register, auth: AuthStatus.authenticated, welcome: true), Routes.profile);
      expect(_go(Routes.splash, auth: AuthStatus.authenticated, welcome: true), Routes.profile);
      // Once they are on their profile (or anywhere in the app) nothing moves them again.
      expect(_go(Routes.profile, auth: AuthStatus.authenticated, welcome: true), isNull);
      expect(_go(Routes.home, auth: AuthStatus.authenticated, welcome: true), isNull);
    });

    test('app screens stay where they are', () {
      expect(_go(Routes.home, auth: AuthStatus.authenticated), isNull);
      expect(_go(Routes.account, auth: AuthStatus.authenticated), isNull);
    });
  });

  group('a provider whose documents are not approved yet', () {
    String? locked(String location, {bool welcome = false}) => _go(location, auth: AuthStatus.authenticated, locked: true, welcome: welcome);

    test('is sent to the verification screen from everywhere that is locked', () {
      for (final path in [Routes.home, Routes.splash, Routes.login, Routes.jobs, Routes.requests, Routes.messages, Routes.notifications, Routes.payments, Routes.activity, Routes.wanted, Routes.refurbOpportunities, Routes.recyclingRequests]) {
        expect(locked(path), Routes.verification, reason: path);
      }
    });

    test('can still open verification, profile, account, settings and help', () {
      for (final path in [Routes.verification, Routes.profile, Routes.account, Routes.settings, Routes.help]) {
        expect(locked(path), isNull, reason: path);
      }
    });

    test('is taken to verification straight after signing up, not to the home screen', () {
      expect(locked(Routes.register, welcome: true), Routes.verification);
      expect(locked(Routes.splash, welcome: true), Routes.verification);
    });

    test('is not moved once approved: logging in goes straight home', () {
      expect(_go(Routes.login, auth: AuthStatus.authenticated), Routes.home);
      expect(_go(Routes.jobs, auth: AuthStatus.authenticated), isNull);
    });
  });
}
