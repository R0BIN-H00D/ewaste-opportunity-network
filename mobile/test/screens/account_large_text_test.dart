import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/account.dart';
import 'package:ewaste_opportunity/models/user.dart';
import 'package:ewaste_opportunity/providers/account_providers.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/screens/account/account_screen.dart';
import 'package:ewaste_opportunity/screens/account/help_screen.dart';
import 'package:ewaste_opportunity/screens/account/notifications_screen.dart';
import 'package:ewaste_opportunity/screens/account/payments_screen.dart';
import 'package:ewaste_opportunity/screens/account/profile_screen.dart';
import 'package:ewaste_opportunity/screens/account/settings_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';

/// Every screen of the account section on a small phone with the text made large: nothing may overflow, for any role,
/// in both themes.
Future<void> _show(WidgetTester tester, Widget screen, UserRole role, double scale, {bool dark = false}) async {
  tester.view.physicalSize = const Size(360, 740);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final account = FakeAccountRepository(
    profileResult: const OwnProfile(city: 'Bengaluru'),
    notes: [
      NotificationItem(id: 'n1', type: 'request.status', title: 'A fairly long title that has to wrap onto a second line', body: 'And a body that is long enough to wrap onto more lines than one at a large text size.', requestId: 'r1', createdAt: DateTime(2026, 11, 16, 10)),
      NotificationItem(id: 'n2', type: 'order.placed', title: 'Order update', readAt: DateTime(2026, 11, 16), createdAt: DateTime(2026, 11, 16, 9)),
    ],
    summary: const PaymentSummary(paid: 1234567, paidCount: 12, received: 7654321, receivedCount: 3),
    paymentList: [PaymentRecord(id: 't1', type: 'repair', amount: 24999, status: 'confirmed', received: true, title: 'A device with quite a long name indeed', counterparty: 'Someone With A Long Name', createdAt: DateTime(2026, 11, 16))],
  );
  final router = GoRouter(routes: [GoRoute(path: '/', builder: (_, __) => Scaffold(body: screen))]);
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository(loginResult: sampleMe(role: role, verificationStatus: role.isProvider ? 'pending' : null))),
        accountRepositoryProvider.overrideWithValue(account),
      ],
      child: MaterialApp.router(
        theme: dark ? AppTheme.dark() : AppTheme.light(),
        routerConfig: router,
        builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
      ),
    ),
  );
  final container = ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
  await container.read(authControllerProvider.notifier).signIn(email: 'asha@example.com', password: 'x');
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  final screens = <String, Widget Function()>{
    'the account hub': () => const AccountScreen(),
    'the profile': () => const ProfilePage(),
    'settings': () => const SettingsPage(),
    'notifications': () => const NotificationsPage(),
    'transaction history': () => const PaymentsPage(),
    'help': () => const HelpPage(),
  };

  for (final role in [UserRole.user, UserRole.technician, UserRole.refurbisher, UserRole.recycler]) {
    for (final scale in [1.0, 1.5, 2.0]) {
      group('${role.label} at $scale x text', () {
        screens.forEach((name, build) {
          testWidgets('$name fits without overflow', (tester) async {
            await _show(tester, build(), role, scale);
            expect(tester.takeException(), isNull);
          });
        });
      });
    }
  }

  testWidgets('the account hub fits in the dark theme too', (tester) async {
    await _show(tester, const AccountScreen(), UserRole.technician, 1.5, dark: true);
    expect(tester.takeException(), isNull);
  });
}
