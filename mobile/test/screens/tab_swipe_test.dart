import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/screens/tab_swipe.dart';
import 'package:ewaste_opportunity/widgets/glass_nav_bar.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

/// A plain page for each app tab with the mobile bottom bar.
Future<void> _pump(WidgetTester tester) async {
  tester.view.physicalSize = const Size(400, 800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(
    initialLocation: '/home',
    routes: [
      StatefulShellRoute(
        builder: (_, __, shell) => Scaffold(
          body: Column(
            children: [
              Text('tab ${shell.currentIndex}'),
              Expanded(child: shell),
            ],
          ),
          bottomNavigationBar: GlassNavBar(
            items: const [
              NavItem(icon: Icons.home_outlined, selectedIcon: Icons.home, label: 'Home'),
              NavItem(icon: Icons.account_balance_wallet_outlined, selectedIcon: Icons.account_balance_wallet, label: 'Wallet'),
              NavItem(icon: Icons.inbox_outlined, selectedIcon: Icons.inbox, label: 'Messages'),
              NavItem(icon: Icons.person_outline, selectedIcon: Icons.person, label: 'Account'),
            ],
            currentIndex: shell.currentIndex,
            onSelected: (index) => shell.goBranch(index),
          ),
        ),
        navigatorContainerBuilder: (_, shell, pages) => TabSwipeContainer(navigationShell: shell, children: pages),
        branches: [
          StatefulShellBranch(routes: [GoRoute(path: '/home', builder: (_, __) => const Center(child: Text('Home page')))]),
          StatefulShellBranch(routes: [GoRoute(path: '/account/payments', builder: (_, __) => const Center(child: Text('Transaction history')))]),
          StatefulShellBranch(routes: [GoRoute(path: '/activity', builder: (_, __) => const Center(child: Text('Messages page')))]),
          StatefulShellBranch(routes: [GoRoute(path: '/account', builder: (_, __) => const Center(child: Text('Account page')))]),
        ],
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(MaterialApp.router(theme: AppTheme.light(), routerConfig: router));
  await tester.pumpAndSettle();
}

/// A quick swipe of the finger across the pages; [right] is the direction the finger moves.
Future<void> _swipe(WidgetTester tester, {required bool right}) async {
  await tester.fling(find.byType(PageView), Offset(right ? 300 : -300, 0), 1500);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('it starts on Home', (tester) async {
    await _pump(tester);
    expect(find.text('tab 0'), findsOneWidget);
    expect(find.text('Home page'), findsOneWidget);
  });

  testWidgets('swiping left on Home opens Wallet', (tester) async {
    await _pump(tester);
    await _swipe(tester, right: false);
    expect(find.text('tab 1'), findsOneWidget, reason: 'the bar follows the swipe');
    expect(find.text('Transaction history'), findsOneWidget);
    expect(find.text('Home page'), findsNothing);
  });

  testWidgets('swiping right on Wallet goes back to Home', (tester) async {
    await _pump(tester);
    await _swipe(tester, right: false);
    await _swipe(tester, right: true);
    expect(find.text('tab 0'), findsOneWidget);
    expect(find.text('Home page'), findsOneWidget);
    expect(find.text('Transaction history'), findsNothing);
  });

  testWidgets('swiping right on Home does nothing', (tester) async {
    await _pump(tester);
    await _swipe(tester, right: true);
    expect(find.text('tab 0'), findsOneWidget);
    expect(find.text('Home page'), findsOneWidget);
    expect(find.text('Account page'), findsNothing);
  });

  testWidgets('Account is the last tab and swiping left stops there', (tester) async {
    await _pump(tester);
    await _swipe(tester, right: false);
    await _swipe(tester, right: false);
    await _swipe(tester, right: false);
    await _swipe(tester, right: false);
    expect(find.text('tab 3'), findsOneWidget);
    expect(find.text('Account page'), findsOneWidget);
  });

  testWidgets('a tab tapped in the bar still switches at once, and swiping then carries on from there', (tester) async {
    await _pump(tester);
    await tester.tap(find.text('Account'));
    await tester.pumpAndSettle();
    expect(find.text('tab 3'), findsOneWidget);
    expect(find.text('Account page'), findsOneWidget);

    await _swipe(tester, right: true);
    expect(find.text('tab 2'), findsOneWidget);
    expect(find.text('Messages page'), findsOneWidget);

    await tester.tap(find.text('Home'));
    await tester.pumpAndSettle();
    expect(find.text('tab 0'), findsOneWidget);
  });

  testWidgets('a half-way drag that is let go returns to where it started', (tester) async {
    await _pump(tester);
    final gesture = await tester.startGesture(const Offset(200, 400));
    await gesture.moveBy(const Offset(-60, 0)); // a short drag to the left, well short of half the page
    await tester.pump();
    await gesture.up();
    await tester.pumpAndSettle();
    expect(find.text('tab 0'), findsOneWidget);
    expect(find.text('Home page'), findsOneWidget);
  });
}
