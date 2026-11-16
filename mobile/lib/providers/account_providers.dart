import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../models/account.dart';
import '../models/page_result.dart';
import '../services/account_repository.dart';
import 'auth_controller.dart';
import 'core_providers.dart';
import 'paged.dart';

final accountRepositoryProvider = Provider<AccountRepository>((ref) => AccountRepository(ref.watch(apiClientProvider)));

/// The person's own profile. Refreshed after an edit by invalidating it.
final ownProfileProvider = FutureProvider.autoDispose<OwnProfile>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(accountRepositoryProvider).profile();
});

/// Light, dark or follow the phone. Kept on the phone so the app opens in the right theme straight away,
/// and copied to the profile so the web can use it too.
class ThemeModeController extends Notifier<ThemeMode> {
  static const storageKey = 'theme_mode';

  @override
  ThemeMode build() {
    Future.microtask(_restore);
    return ThemeMode.system;
  }

  Future<void> _restore() async {
    final saved = await ref.read(keyValueStoreProvider).read(storageKey);
    final mode = themeModeFrom(saved);
    if (mode != state) state = mode;
  }

  /// Changes the theme now; saving to the profile is best-effort (the phone keeps the choice either way).
  Future<void> set(ThemeMode mode) async {
    state = mode;
    await ref.read(keyValueStoreProvider).write(storageKey, mode.name);
    try {
      await ref.read(accountRepositoryProvider).updatePreferences(theme: mode.name);
    } catch (_) {
      // Offline or signed out: the local choice still applies.
    }
  }
}

ThemeMode themeModeFrom(String? value) => ThemeMode.values.firstWhere((m) => m.name == value, orElse: () => ThemeMode.system);

final themeModeProvider = NotifierProvider<ThemeModeController, ThemeMode>(ThemeModeController.new);

/// How many notifications are unread, for the badge on the Account tab.
final unreadNotificationsProvider = FutureProvider.autoDispose<int>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(accountRepositoryProvider).unreadCount();
});

class NotificationsController extends PagedNotifier<NotificationItem> {
  @override
  Paged<NotificationItem> build() {
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    return start();
  }

  @override
  Future<PageResult<NotificationItem>> fetch(int page) async => (await ref.read(accountRepositoryProvider).notifications(page: page)).page;

  /// Marks one read on screen at once, then on the server; the badge refreshes.
  Future<void> markRead(String id) async {
    final item = state.items.where((n) => n.id == id).firstOrNull;
    if (item == null || item.isRead) return;
    state = state.copyWith(items: [for (final n in state.items) n.id == id ? n.markedRead() : n]);
    try {
      await ref.read(accountRepositoryProvider).markRead(id);
    } finally {
      ref.invalidate(unreadNotificationsProvider);
    }
  }

  Future<void> markAllRead() async {
    await ref.read(accountRepositoryProvider).markAllRead();
    state = state.copyWith(items: [for (final n in state.items) n.markedRead()]);
    ref.invalidate(unreadNotificationsProvider);
  }
}

final notificationsProvider = NotifierProvider<NotificationsController, Paged<NotificationItem>>(NotificationsController.new);

class PaymentsController extends PagedNotifier<PaymentRecord> {
  @override
  Paged<PaymentRecord> build() {
    ref.watch(authControllerProvider.select((s) => s.user?.id));
    return start();
  }

  @override
  Future<PageResult<PaymentRecord>> fetch(int page) => ref.read(accountRepositoryProvider).payments(page: page);
}

final paymentsProvider = NotifierProvider<PaymentsController, Paged<PaymentRecord>>(PaymentsController.new);

final paymentSummaryProvider = FutureProvider.autoDispose<PaymentSummary>((ref) {
  ref.watch(authControllerProvider.select((s) => s.user?.id));
  return ref.watch(accountRepositoryProvider).paymentSummary();
});
