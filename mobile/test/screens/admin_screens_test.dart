import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/user.dart';
import 'package:ewaste_opportunity/providers/account_providers.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/providers/chat_providers.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/routes/app_router.dart';
import 'package:ewaste_opportunity/screens/admin/admin_catalog.dart';
import 'package:ewaste_opportunity/screens/admin/admin_list_page.dart';
import 'package:ewaste_opportunity/services/admin_repository.dart';
import 'package:ewaste_opportunity/widgets/glass_nav_bar.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';

class _Admin extends AdminRepository {
  _Admin() : super(Dio());
  final changes = <(String, String, AdminRecord?)>[];
  final queries = <AdminRecord>[];
  final analyticsPeriods = <int>[];

  @override
  Future<AdminPageData> list(String path, {AdminRecord query = const {}, int page = 1}) async {
    queries.add(Map.of(query));
    return switch (path) {
      'verifications' => const AdminPageData([
          {'userId': 'abc', 'type': 'recipient', 'name': 'Green School', 'status': 'pending'},
        ], {
          'total': 1,
          'pages': 1
        }),
      _ => const AdminPageData([], {}),
    };
  }

  @override
  Future<AdminRecord> record(String path, {AdminRecord query = const {}}) async {
    if (path == 'analytics') {
      analyticsPeriods.add(query['months'] as int);
      return {
        'period': {'from': '2026-09', 'to': '2026-11'},
        'registrations': {
          'total': 24,
          'byRole': {'user': 19, 'technician': 5},
          'series': [
            {'month': '2026-09', 'members': 4, 'providers': 1},
            {'month': '2026-10', 'members': 8, 'providers': 2},
            {'month': '2026-11', 'members': 7, 'providers': 2},
          ],
        },
        'growth': [
          {'month': '2026-09', 'total': 48},
          {'month': '2026-11', 'total': 67}
        ],
        'services': {
          'repairs': {'created': 12, 'completed': 8}
        },
        'recycling': {'devices': 10},
        'categories': [
          {'name': 'Laptops', 'count': 9}
        ],
        'impact': {'weighedKg': 12.5, 'estimatedKg': 3},
      };
    }
    if (path == 'dashboard') {
      return {
        'people': {'total': 18},
        'attention': {
          'pendingVerifications': {'total': 4},
          'openReports': 3,
          'openComplaints': 2
        },
        'recentActivity': [
          {
            'action': 'verification.approved',
            'admin': {'name': 'Test Admin'},
            'at': '2024-11-18T10:15:00',
            'reason': 'Application documents matched.',
          },
          {
            'action': 'report.actioned',
            'admin': {'name': 'Second Admin'},
            'at': '2024-11-17T14:00:00',
          },
        ],
      };
    }
    expect(path, 'verifications/abc');
    expect(query, {'type': 'recipient'});
    return {
      'userId': 'abc',
      'type': 'recipient',
      'status': 'pending',
      'user': {'name': 'Green School'},
      'actions': ['approve', 'reject', 'request_resubmission'],
    };
  }

  @override
  Future<void> change(String method, String path, [AdminRecord? body]) async => changes.add((method, path, body));
}

Future<void> _open(WidgetTester tester, AdminSection section, _Admin repo) async {
  tester.view.physicalSize = const Size(420, 850);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ProviderScope(
    overrides: [adminRepositoryProvider.overrideWithValue(repo)],
    child: MaterialApp(theme: AppTheme.light(), home: AdminListPage(section: section)),
  ));
  await tester.pumpAndSettle();
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

Future<ProviderContainer> _signIn(WidgetTester tester, _Admin repo, UserRole role) async {
  tester.view.physicalSize = const Size(390, 850);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(ProviderScope(
    overrides: [
      adminRepositoryProvider.overrideWithValue(repo),
      keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
      authRepositoryProvider.overrideWithValue(FakeAuthRepository(loginResult: sampleMe(role: role))),
      accountRepositoryProvider.overrideWithValue(FakeAccountRepository()),
      chatRepositoryProvider.overrideWithValue(FakeChatRepository()),
      liveUpdatesProvider.overrideWith((_) {}),
      bootProvider.overrideWith((_) async {}),
    ],
    child: Consumer(
        builder: (context, ref, _) => MaterialApp.router(
              theme: AppTheme.light(),
              routerConfig: ref.watch(routerProvider),
            )),
  ));
  final ref = ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
  await ref.read(authControllerProvider.notifier).signIn(email: 'admin@example.com', password: 'test-password');
  await tester.pumpAndSettle();
  return ref;
}

Finder _tab(String label) => find.descendant(of: find.byType(GlassNavBar), matching: find.text(label));

void _expectTab(WidgetTester tester, int index) {
  final bar = tester.widget<GlassNavBar>(find.byType(GlassNavBar));
  expect(bar.currentIndex, index);
}

void main() {
  for (final role in UserRole.values) {
    testWidgets('${role.name} keeps the bottom bar on Account pages and can switch tabs there', (tester) async {
      final repo = _Admin();
      final ref = await _signIn(tester, repo, role);
      final router = ref.read(routerProvider);
      await _tap(tester, _tab('Account'));
      _expectTab(tester, 3);
      await _tap(tester, find.text('Settings'));
      expect(router.state.matchedLocation, Routes.settings);
      _expectTab(tester, 3);
      await _tap(tester, _tab(role == UserRole.admin ? 'Verification' : 'Wallet'));
      _expectTab(tester, 1);
      expect(find.text(role == UserRole.admin ? 'PENDING VERIFICATION' : 'Transaction history'), findsOneWidget);
    });
  }

  testWidgets('swiping updates the persistent bar and signing out removes it', (tester) async {
    final ref = await _signIn(tester, _Admin(), UserRole.user);
    await tester.fling(find.byType(PageView), const Offset(-290, 0), 1500);
    await tester.pumpAndSettle();
    _expectTab(tester, 1);
    expect(find.text('Transaction history'), findsOneWidget);

    await ref.read(authControllerProvider.notifier).signOut();
    await tester.pumpAndSettle();
    expect(find.byType(GlassNavBar), findsNothing);
  });

  testWidgets('admin Home cards open the correct queues and community roles', (tester) async {
    final repo = _Admin();
    final ref = await _signIn(tester, repo, UserRole.admin);
    expect(find.text('4 pending verifications'), findsOneWidget);
    expect(find.text('18 people'), findsOneWidget);
    expect(find.text('2 active complaints'), findsOneWidget);

    final router = ref.read(routerProvider);
    Future<void> back() async {
      router.pop();
      await tester.pumpAndSettle();
    }

    await _tap(tester, find.text('Administration'));
    expect(find.text('PENDING VERIFICATION'), findsOneWidget);
    expect(find.text('APPROVED VERIFICATION'), findsOneWidget);
    await _tap(tester, find.text('Service providers').first);
    expect(repo.queries.last, {'type': 'provider', 'status': 'pending'});
    await back();
    await _tap(tester, find.text('Recipient organisations').last);
    expect(repo.queries.last, {'type': 'recipient', 'status': 'approved'});
    await back();
    await back();

    await _tap(tester, find.text('Reports'));
    expect(find.text('Analytics'), findsOneWidget);
    expect(find.text('Audit log'), findsOneWidget);
    await back();
    await _tap(tester, find.text('Recent Activity'));
    expect(find.text('Verification approved'), findsOneWidget);
    expect(find.text('Report handled'), findsOneWidget);
    expect(find.text('18 Nov 2024'), findsOneWidget);
    expect(find.text('17 Nov 2024'), findsOneWidget);
    expect(find.text('Test Admin'), findsOneWidget);
    await _tap(tester, find.text('Verification approved'));
    expect(find.text('Application documents matched.'), findsOneWidget);
    expect(find.byType(GlassNavBar), findsOneWidget);
    await back();
    await _tap(tester, find.text('Open audit log'));
    expect(router.state.matchedLocation, Routes.adminTool('audit'));
    await back();
    await back();
    await _tap(tester, find.text('Community'));
    expect(find.text('Current end users'), findsOneWidget);
    expect(find.text('Technicians'), findsOneWidget);
    expect(find.text('Recycling team'), findsOneWidget);
    await _tap(tester, find.text('Refurbishment team'));
    expect(repo.queries.last, {'role': 'refurbisher'});
    await back();
    await back();
    await _tap(tester, find.text('Complaints').first);
    expect(repo.queries.last, {'status': 'active'});
    await back();
    await _tap(tester, find.text('Announcements'));
    expect(router.state.matchedLocation, Routes.adminTool('announcements'));
    expect(find.byTooltip('Add'), findsOneWidget);
  });

  testWidgets('admins use Verification and Complaints from the bottom bar', (tester) async {
    final repo = _Admin();
    await _signIn(tester, repo, UserRole.admin);
    final tabs = tester.widget<GlassNavBar>(find.byType(GlassNavBar));
    expect(tabs.items.map((item) => item.label), ['Home', 'Verification', 'Complaints', 'Account']);

    await _tap(tester, _tab('Verification'));
    expect(find.text('PENDING VERIFICATION'), findsOneWidget);
    expect(find.text('APPROVED VERIFICATION'), findsOneWidget);
    await _tap(tester, _tab('Complaints'));
    expect(repo.queries.last, {'status': 'active'});
    expect(find.text('No matching records.'), findsOneWidget);
  });

  testWidgets('analytics switches the reporting period and exposes exact trend values', (tester) async {
    final repo = _Admin();
    await _signIn(tester, repo, UserRole.admin);
    await _tap(tester, find.text('Reports'));
    await _tap(tester, find.text('Analytics'));
    expect(repo.analyticsPeriods, [12]);
    expect(find.text('Export CSV'), findsOneWidget);
    expect(find.text('New sign-ups'), findsOneWidget);
    await _tap(tester, find.text('3 months'));
    expect(repo.analyticsPeriods, [12, 3]);
    await tester.scrollUntilVisible(find.text('Growth'), 220);
    expect(find.byType(BarChart), findsOneWidget);
    await _tap(tester, find.text('Growth'));
    expect(find.text('Platform growth'), findsOneWidget);
    expect(find.byType(LineChart), findsOneWidget);
    await tester.scrollUntilVisible(find.text('Monthly figures'), 220);
    await _tap(tester, find.text('Monthly figures'));
    expect(find.text('People: 67'), findsOneWidget);
    tester.state<ScrollableState>(find.byType(Scrollable).last).position.jumpTo(0);
    await tester.pumpAndSettle();
    await _tap(tester, find.widgetWithText(ChoiceChip, '6 months').hitTestable());
    expect(repo.analyticsPeriods, [12, 3, 6]);
    await tester.scrollUntilVisible(find.text('Platform growth'), 220);
    expect(find.byType(LineChart), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('members still open Wallet and Messages from the bottom bar', (tester) async {
    final repo = _Admin();
    await _signIn(tester, repo, UserRole.user);
    final tabs = tester.widget<GlassNavBar>(find.byType(GlassNavBar));
    expect(tabs.items.map((item) => item.label), ['Home', 'Wallet', 'Messages', 'Account']);

    await _tap(tester, _tab('Wallet'));
    expect(find.text('Transaction history'), findsOneWidget);
    await _tap(tester, _tab('Messages'));
    expect(find.text('Conversations'), findsOneWidget);
    expect(repo.queries, isEmpty);
  });

  testWidgets('recipient verification uses the correct request and requires a reason to refuse', (tester) async {
    final repo = _Admin();
    await _open(tester, AdminSection.verifications, repo);
    await _tap(tester, find.text('Green School'));
    await _tap(tester, find.text('Refuse submission'));
    final confirm = find.descendant(of: find.byType(AlertDialog), matching: find.text('Refuse submission'));
    await _tap(tester, confirm);
    expect(repo.changes, isEmpty);
    expect(find.text('This field is required.'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField), 'The registration details do not match.');
    await _tap(tester, confirm);
    expect(repo.changes, hasLength(1));
    final (method, path, body) = repo.changes.single;
    expect(method, 'PUT');
    expect(path, 'verifications/abc');
    expect(body, {'type': 'recipient', 'decision': 'rejected', 'reason': 'The registration details do not match.'});
    expect(find.text('Green School'), findsOneWidget);
  });

  testWidgets('creating a category sends the edited fields to the categories API', (tester) async {
    final repo = _Admin();
    await _open(tester, AdminSection.categories, repo);
    await _tap(tester, find.byTooltip('Add'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Name'), 'Audio equipment');
    await tester.enterText(find.widgetWithText(TextFormField, 'Group'), 'Accessories');
    await _tap(tester, find.text('Save'));
    final (method, path, body) = repo.changes.single;
    expect(method, 'POST');
    expect(path, 'categories');
    expect(body, {'name': 'Audio equipment', 'group': 'Accessories', 'hazardous': false});
  });

  testWidgets('search only reaches the users API after applying filters', (tester) async {
    final repo = _Admin();
    await _open(tester, AdminSection.users, repo);
    await _tap(tester, find.text('Filters'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Name or email'), 'green');
    expect(repo.queries, hasLength(1));
    await _tap(tester, find.text('Show results'));
    expect(repo.queries.last, {'q': 'green'});
    expect(find.text('Filters (1)'), findsOneWidget);
  });
}
