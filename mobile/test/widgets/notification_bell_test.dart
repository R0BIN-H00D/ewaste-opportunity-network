import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/account.dart';
import 'package:ewaste_opportunity/models/user.dart';
import 'package:ewaste_opportunity/providers/account_providers.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/widgets/glass_app_bar.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../helpers.dart';

const _unread = [
  NotificationItem(id: 'n1', type: 'order.placed', title: 'New order'),
  NotificationItem(id: 'n2', type: 'order.placed', title: 'Another one'),
];

/// A page with the shared app bar, with [me] signed in (or nobody when null).
Future<void> _pump(WidgetTester tester, {Me? me}) async {
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (context, __) => Scaffold(appBar: glassAppBar(context, 'Orders'), body: const SizedBox())),
    GoRoute(path: '/account/notifications', builder: (_, __) => const Scaffold(body: Text('the notifications page'))),
  ]);
  addTearDown(router.dispose);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
      authRepositoryProvider.overrideWithValue(FakeAuthRepository(loginResult: me)),
      accountRepositoryProvider.overrideWithValue(FakeAccountRepository(notes: _unread)),
    ],
    child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
  ));
  if (me != null) {
    final container = ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
    await container.read(authControllerProvider.notifier).signIn(email: 'a@b.c', password: 'x');
  }
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  testWidgets('every page has a bell with the number of unread notifications, and it opens them', (tester) async {
    await _pump(tester, me: sampleMe());
    expect(find.bySemanticsLabel('Notifications, 2 unread'), findsOneWidget);
    expect(find.text('2'), findsOneWidget);
    await tester.tap(find.byTooltip('Notifications'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(find.text('the notifications page'), findsOneWidget);
  });

  testWidgets('nobody who is signed out sees a bell', (tester) async {
    await _pump(tester);
    expect(find.byTooltip('Notifications'), findsNothing);
  });

  testWidgets('a provider whose documents are not approved yet sees no bell', (tester) async {
    await _pump(tester, me: sampleMe(role: UserRole.technician, verificationStatus: 'pending'));
    expect(find.byTooltip('Notifications'), findsNothing);
  });

  testWidgets('an approved provider has the bell', (tester) async {
    await _pump(tester, me: sampleMe(role: UserRole.refurbisher));
    expect(find.byTooltip('Notifications'), findsOneWidget);
  });
}
