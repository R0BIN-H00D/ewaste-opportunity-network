import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/account.dart';
import 'package:ewaste_opportunity/providers/account_providers.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/technicians_controller.dart';
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

/// Pumps [screen] for a signed-in member, with [account] answering every account call. Returns the store for theme checks.
Future<MemoryKeyValueStore> _pump(WidgetTester tester, Widget screen, FakeAccountRepository account, {String? openedFrom}) async {
  tester.view.physicalSize = const Size(900, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final store = MemoryKeyValueStore();
  final router = GoRouter(
    initialLocation: '/',
    routes: [
      GoRoute(path: '/', builder: (_, __) => Scaffold(body: openedFrom == null ? screen : Center(child: Text(openedFrom)))),
      GoRoute(path: '/screen', builder: (_, __) => screen),
      GoRoute(path: '/requests/:id', builder: (_, s) => Scaffold(body: Text('request ${s.pathParameters['id']}'))),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(store),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
        accountRepositoryProvider.overrideWithValue(account),
        requestRepositoryProvider.overrideWithValue(FakeRequestRepository()),
      ],
      child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
    ),
  );
  final container = ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
  await container.read(authControllerProvider.notifier).signIn(email: 'asha@example.com', password: 'x');
  if (openedFrom != null) router.push('/screen');
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
  return store;
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

NotificationItem _note(String id, String title, {bool read = false, String? requestId}) => NotificationItem(
      id: id,
      type: 'request.status',
      title: title,
      requestId: requestId,
      readAt: read ? DateTime(2026, 11, 16) : null,
      createdAt: DateTime(2026, 11, 16, 10),
    );

void main() {
  testWidgets('the account hub links to everything and shows the unread count', (tester) async {
    await _pump(tester, const AccountScreen(), FakeAccountRepository(notes: [_note('n1', 'A'), _note('n2', 'B'), _note('n3', 'C', read: true)]));
    for (final label in ['Notifications', 'Profile', 'Transaction history', 'Settings', 'Help and support', 'Sign out']) {
      expect(find.text(label), findsOneWidget);
    }
    expect(find.text('2'), findsOneWidget); // unread badge
  });

  testWidgets('notifications: unread stand out, opening one marks it read and opens its request', (tester) async {
    final repo = FakeAccountRepository(notes: [_note('n1', 'New quotation to review', requestId: 'r9'), _note('n2', 'Repair update', read: true)]);
    await _pump(tester, const NotificationsPage(), repo, openedFrom: 'start');
    expect(find.text('1 unread'), findsOneWidget);

    await _tap(tester, find.text('New quotation to review'));
    expect(repo.calls, ['read:n1']);
    expect(find.text('request r9'), findsOneWidget);
  });

  testWidgets('notifications: mark all as read', (tester) async {
    final repo = FakeAccountRepository(notes: [_note('n1', 'One'), _note('n2', 'Two')]);
    await _pump(tester, const NotificationsPage(), repo, openedFrom: 'start');
    await _tap(tester, find.text('Mark all as read'));
    expect(repo.calls, ['read-all']);
    expect(find.text('All caught up'), findsOneWidget);
  });

  testWidgets('transaction history shows the totals and each record with its direction', (tester) async {
    final repo = FakeAccountRepository(
      summary: const PaymentSummary(paid: 2500, paidCount: 1),
      paymentList: [PaymentRecord(id: 't1', type: 'repair', amount: 2500, status: 'recorded', received: false, title: 'Test Galaxy A12', counterparty: 'Ravi Kumar', createdAt: DateTime(2026, 11, 16))],
    );
    await _pump(tester, const PaymentsPage(), repo);
    expect(find.text('You paid'), findsOneWidget);
    expect(find.text('₹2,500'), findsOneWidget);
    expect(find.text('Test Galaxy A12'), findsOneWidget);
    expect(find.text('To Ravi Kumar'), findsOneWidget);
    expect(find.text('−₹2,500'), findsOneWidget);
    expect(find.text('Recorded'), findsOneWidget);
  });

  testWidgets('transaction history: a free donation shows "Free", not "+Free", and a payment received shows a plus', (tester) async {
    final repo = FakeAccountRepository(paymentList: [
      PaymentRecord(id: 't1', type: 'donation', amount: 0, status: 'confirmed', received: true, title: 'Dell monitor', createdAt: DateTime(2026, 11, 15)),
      PaymentRecord(id: 't2', type: 'order', amount: 1500, status: 'recorded', received: true, title: 'ThinkPad', createdAt: DateTime(2026, 11, 15)),
    ]);
    await _pump(tester, const PaymentsPage(), repo);
    expect(find.text('Free'), findsOneWidget);
    expect(find.text('+Free'), findsNothing);
    expect(find.text('+₹1,500'), findsOneWidget);
    expect(find.text('₹0'), findsNWidgets(2)); // the two totals, with nothing paid or received yet
  });

  testWidgets('profile: checks the phone, then saves account and profile together', (tester) async {
    final repo = FakeAccountRepository(profileResult: const OwnProfile(city: 'Bengaluru'));
    await _pump(tester, const ProfilePage(), repo, openedFrom: 'start');
    expect(find.text('Bengaluru'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextFormField, 'Phone (optional)'), 'abc');
    await _tap(tester, find.text('Save profile'));
    expect(find.text('Enter a valid phone number'), findsOneWidget);
    expect(repo.calls, isEmpty);

    await tester.enterText(find.widgetWithText(TextFormField, 'Phone (optional)'), '+91 98765 43210');
    await tester.enterText(find.widgetWithText(TextFormField, 'Area or locality'), 'Indiranagar');
    await _tap(tester, find.text('Save profile'));
    expect(repo.calls, ['account:Asha Rao:+91 98765 43210', 'profile:Indiranagar:Bengaluru:::']);
    expect(find.text('start'), findsOneWidget); // back where it was opened from
  });

  testWidgets('settings: the theme applies at once, is kept on the phone and copied to the profile', (tester) async {
    final repo = FakeAccountRepository();
    final store = await _pump(tester, const SettingsPage(), repo);
    await _tap(tester, find.text('Dark'));
    final container = ProviderScope.containerOf(tester.element(find.text('Dark')));
    expect(container.read(themeModeProvider), ThemeMode.dark);
    expect(await store.read(ThemeModeController.storageKey), 'dark');
    expect(repo.calls, contains('prefs:-:-:dark'));

    await _tap(tester, find.text('Email updates'));
    expect(repo.calls, contains('prefs:false:-:-'));
  });

  testWidgets('help: answers open, and the form checks then sends with the signed-in name and email', (tester) async {
    final repo = FakeAccountRepository();
    await _pump(tester, const HelpPage(), repo);
    await _tap(tester, find.text(helpTopics.first.$1));
    expect(find.text(helpTopics.first.$2), findsOneWidget);

    await _tap(tester, find.text('Send message'));
    expect(find.text('Enter a subject'), findsOneWidget);
    expect(repo.calls, isEmpty);

    await tester.enterText(find.widgetWithText(TextFormField, 'Subject'), 'Pickup question');
    await tester.enterText(find.widgetWithText(TextFormField, 'Message'), 'Can the technician come on Sunday?');
    await _tap(tester, find.text('Send message'));
    expect(repo.calls, ['contact:Asha Rao:asha@example.com:Pickup question:Can the technician come on Sunday?']);
    expect(find.textContaining('Your message is on its way'), findsOneWidget);
  });
}
