import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/models/user.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import '../helpers.dart';

ProviderContainer _container(FakeAuthRepository repo, [MemoryKeyValueStore? store]) {
  final container = ProviderContainer(overrides: [
    keyValueStoreProvider.overrideWithValue(store ?? MemoryKeyValueStore()),
    authRepositoryProvider.overrideWithValue(repo),
  ]);
  addTearDown(container.dispose);
  return container;
}

void main() {
  group('restore', () {
    test('a saved session signs the person in', () async {
      final container = _container(FakeAuthRepository(restoreResult: sampleMe(role: UserRole.technician)));
      expect(container.read(authControllerProvider).status, AuthStatus.unknown);

      await container.read(authControllerProvider.notifier).restore();

      final state = container.read(authControllerProvider);
      expect(state.status, AuthStatus.authenticated);
      expect(state.user?.role, UserRole.technician);
    });

    test('no saved session means signed out', () async {
      final container = _container(FakeAuthRepository());
      await container.read(authControllerProvider.notifier).restore();
      expect(container.read(authControllerProvider).status, AuthStatus.unauthenticated);
    });

    test('being offline at start-up does not throw', () async {
      final container = _container(FakeAuthRepository(restoreError: ApiException.offline));
      await container.read(authControllerProvider.notifier).restore();
      expect(container.read(authControllerProvider).status, AuthStatus.unauthenticated);
    });
  });

  group('signing in and out', () {
    test('signIn stores who signed in', () async {
      final repo = FakeAuthRepository(loginResult: sampleMe(role: UserRole.recycler));
      final container = _container(repo);

      await container.read(authControllerProvider.notifier).signIn(email: 'a@b.co', password: 'x');

      expect(container.read(authControllerProvider).user?.role, UserRole.recycler);
      expect(repo.loginEmails, ['a@b.co']);
    });

    test('a failed sign-in throws for the screen and leaves the state alone', () async {
      final repo = FakeAuthRepository(loginError: const ApiException('Incorrect email or password', failure: ApiFailure.unauthorized));
      final container = _container(repo);

      await expectLater(
        container.read(authControllerProvider.notifier).signIn(email: 'a@b.co', password: 'x'),
        throwsA(isA<ApiException>()),
      );
      expect(container.read(authControllerProvider).status, AuthStatus.unknown);
    });

    test('register passes the role and organisation on', () async {
      final repo = FakeAuthRepository();
      final container = _container(repo);

      await container.read(authControllerProvider.notifier).register(
            name: 'Ravi',
            email: 'ravi@example.com',
            password: 'Demo@12345',
            role: UserRole.refurbisher,
            organizationName: 'ReNew Works',
          );

      expect(repo.lastRegistration?['role'], UserRole.refurbisher);
      expect(repo.lastRegistration?['organizationName'], 'ReNew Works');
      expect(container.read(authControllerProvider).status, AuthStatus.authenticated);
    });

    test('signOut tells the repository and signs out', () async {
      final repo = FakeAuthRepository(loginResult: sampleMe());
      final container = _container(repo);
      final controller = container.read(authControllerProvider.notifier);
      await controller.signIn(email: 'a@b.co', password: 'x');

      await controller.signOut();

      expect(repo.loggedOut, isTrue);
      expect(container.read(authControllerProvider).status, AuthStatus.unauthenticated);
      expect(container.read(authControllerProvider).me, isNull);
    });

    test('an expired session signs the person out wherever they are', () async {
      final container = _container(FakeAuthRepository(loginResult: sampleMe()));
      await container.read(authControllerProvider.notifier).signIn(email: 'a@b.co', password: 'x');

      container.read(apiClientProvider).onSessionExpired!();

      expect(container.read(authControllerProvider).status, AuthStatus.unauthenticated);
    });
  });

  group('onboarding flag', () {
    test('starts unseen, is saved when completed and is read back', () async {
      final store = MemoryKeyValueStore();
      final first = _container(FakeAuthRepository(), store);
      await first.read(onboardingProvider.notifier).load();
      expect(first.read(onboardingProvider), isFalse);

      await first.read(onboardingProvider.notifier).complete();
      expect(first.read(onboardingProvider), isTrue);

      final second = _container(FakeAuthRepository(), store);
      await second.read(onboardingProvider.notifier).load();
      expect(second.read(onboardingProvider), isTrue);
    });
  });

  test('bootProvider loads the flag and restores the session', () async {
    final store = MemoryKeyValueStore();
    await store.write(StoreKeys.onboardingSeen, 'true');
    final container = _container(FakeAuthRepository(restoreResult: sampleMe()), store);

    await container.read(bootProvider.future);

    expect(container.read(onboardingProvider), isTrue);
    expect(container.read(authControllerProvider).status, AuthStatus.authenticated);
  });
}
