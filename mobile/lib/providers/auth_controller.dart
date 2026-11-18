import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../core/network/api_exception.dart';
import '../core/storage/key_value_store.dart';
import '../models/user.dart';
import '../services/auth_repository.dart';
import 'core_providers.dart';

enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState {
  const AuthState({this.status = AuthStatus.unknown, this.me, this.justRegistered = false});

  final AuthStatus status;
  final Me? me;

  /// True right after sign-up, until the profile page has been opened: the next screen is their profile.
  final bool justRegistered;

  AppUser? get user => me?.user;
}

/// Who is signed in. The router listens to this and moves between the sign-in screens and the app.
class AuthController extends Notifier<AuthState> {
  @override
  AuthState build() {
    // When the server refuses the refresh token the person is signed out, wherever they are in the app.
    ref.read(apiClientProvider).onSessionExpired = () {
      _forgetSavedData();
      state = const AuthState(status: AuthStatus.unauthenticated);
    };
    return const AuthState();
  }

  AuthRepository get _repo => ref.read(authRepositoryProvider);

  AuthState _signedIn(Me me) {
    ref.read(apiClientProvider).useCacheFor(me.user.id);
    return AuthState(status: AuthStatus.authenticated, me: me);
  }

  /// Saved lists belong to the person who was signed in; they are wiped when that person leaves.
  void _forgetSavedData() {
    unawaited(ref.read(apiClientProvider).endCacheSession());
    ref.read(savedDataSinceProvider.notifier).state = null;
  }

  /// Called once at start-up. Never throws: if nobody can be restored the app simply shows the sign-in screens.
  /// (Offline start-up keeps the saved token, so the next launch with a connection signs in by itself.)
  Future<void> restore() async {
    try {
      final me = await _repo.restore();
      state = me == null ? const AuthState(status: AuthStatus.unauthenticated) : _signedIn(me);
    } on ApiException {
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  /// Throws an [ApiException] for the screen to show.
  Future<void> signIn({required String email, required String password}) async {
    state = _signedIn(await _repo.login(email: email, password: password));
  }

  Future<void> register({
    required String name,
    required String email,
    required String password,
    required UserRole role,
    String? phone,
    String? organizationName,
  }) async {
    final signedIn = _signedIn(await _repo.register(
      name: name,
      email: email,
      password: password,
      role: role,
      phone: phone,
      organizationName: organizationName,
    ));
    state = AuthState(status: signedIn.status, me: signedIn.me, justRegistered: true);
  }

  /// The profile page has been shown, so the one-time redirect after sign-up is done.
  void welcomed() {
    if (state.justRegistered) state = AuthState(status: state.status, me: state.me);
  }

  Future<void> signOut() async {
    await _repo.logout();
    _forgetSavedData();
    state = const AuthState(status: AuthStatus.unauthenticated);
  }

  /// Takes the account the server answered with after an edit (name, phone), so every screen shows it at once.
  void adoptUser(AppUser user) {
    final me = state.me;
    if (me == null || me.user.id != user.id) return;
    state = _signedIn(me.copyWith(user: user));
  }

  /// Reloads the signed-in person's data (for example after verifying an email). Failures keep what is already shown.
  Future<void> reload() async {
    try {
      state = _signedIn(await _repo.me());
    } on ApiException {
      // Keep the current state; the next call will try again.
    }
  }
}

final authControllerProvider = NotifierProvider<AuthController, AuthState>(AuthController.new);

/// Whether the first-run introduction has been seen. Stored on the device.
class OnboardingController extends Notifier<bool> {
  @override
  bool build() => false;

  KeyValueStore get _store => ref.read(keyValueStoreProvider);

  Future<void> load() async {
    state = (await _store.read(StoreKeys.onboardingSeen)) == 'true';
  }

  Future<void> complete() async {
    state = true;
    await _store.write(StoreKeys.onboardingSeen, 'true');
  }
}

final onboardingProvider = NotifierProvider<OnboardingController, bool>(OnboardingController.new);

/// Start-up work shown behind the splash screen: remember whether the introduction was seen, then restore the session.
final bootProvider = FutureProvider<void>((ref) async {
  await ref.read(onboardingProvider.notifier).load();
  await ref.read(authControllerProvider.notifier).restore();
});
