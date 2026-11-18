import 'package:ewaste_opportunity/models/impact.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/user.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/impact_providers.dart';
import 'package:ewaste_opportunity/routes/route_paths.dart';
import 'package:ewaste_opportunity/screens/impact/impact_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';

Future<void> _pump(
    WidgetTester tester, Widget screen, FakeImpactRepository repo,
    {UserRole role = UserRole.user, double scale = 1}) async {
  tester.view.physicalSize = const Size(380, 4200);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, __) => Scaffold(body: screen)),
    GoRoute(
        path: Routes.impact,
        builder: (_, __) => const Scaffold(body: Text('IMPACT PAGE'))),
  ]);
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(
            FakeAuthRepository(loginResult: sampleMe(role: role))),
        impactRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp.router(
        theme: AppTheme.light(),
        routerConfig: router,
        builder: (context, child) => MediaQuery(
            data: MediaQuery.of(context)
                .copyWith(textScaler: TextScaler.linear(scale)),
            child: child!),
      ),
    ),
  );
  final container =
      ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
  await container
      .read(authControllerProvider.notifier)
      .signIn(email: 'asha@example.com', password: 'x');
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  group('the Impact screen', () {
    testWidgets(
        'keeps actual, measured and estimated figures apart and labels each',
        (tester) async {
      await _pump(tester, const ImpactScreen(), FakeImpactRepository());
      expect(find.text('3'), findsWidgets);
      expect(find.text('devices kept in use'), findsOneWidget);
      expect(find.text('Actual'), findsOneWidget);
      expect(find.text('1.5 kg'), findsOneWidget);
      expect(find.text('Measured'), findsOneWidget);
      expect(find.text('2 kg'), findsOneWidget);
      expect(find.text('150 kg'), findsOneWidget);
      expect(find.text('Estimate'),
          findsNWidgets(2)); // the unweighed materials and the CO2e
      expect(find.textContaining('not sourced yet'), findsOneWidget);
      expect(find.text('Repaired 1'), findsOneWidget);
      expect(find.text('Donated 2'), findsOneWidget);
      expect(find.textContaining('Reused'),
          findsNothing); // kinds with nothing are left out
    });

    testWidgets('a person with no activity sees an honest "nothing yet"',
        (tester) async {
      final repo = FakeImpactRepository(
        summary: impactJson(devices: 0, measured: 0, estimated: 0, co2e: 0),
        months: [
          {'month': '2026-10', 'devices': 0, 'byType': {}},
          {'month': '2026-11', 'devices': 0, 'byType': {}}
        ],
      );
      await _pump(tester, const ImpactScreen(), repo);
      expect(find.textContaining('Nothing yet. When a repair'), findsOneWidget);
      expect(find.text('Nothing in the last 2 months.'), findsOneWidget);
    });

    testWidgets('draws the monthly chart when there is activity',
        (tester) async {
      await _pump(tester, const ImpactScreen(), FakeImpactRepository());
      expect(find.text('Month by month'), findsOneWidget);
      expect(
          find.bySemanticsLabel(
              RegExp('Bar chart of devices kept in use by month')),
          findsOneWidget);
    });

    testWidgets('says why it cannot load, and loads when retried',
        (tester) async {
      final repo = FakeImpactRepository()
        ..error = const ApiException('Cannot reach the server',
            failure: ApiFailure.network);
      await _pump(tester, const ImpactScreen(), repo);
      expect(find.textContaining('Cannot reach the server'), findsWidgets);

      repo.error = null;
      await tester.tap(find.text('Try again').first);
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(find.text('devices kept in use'), findsOneWidget);
    });

    testWidgets('fits on a small phone with large text', (tester) async {
      await _pump(tester, const ImpactScreen(), FakeImpactRepository(),
          scale: 2);
      expect(tester.takeException(), isNull);
    });
  });

  group('the year and kind-of-device breakdowns', () {
    testWidgets(
        'show each year and each kind with its count and what it was made of',
        (tester) async {
      await _pump(tester, const ImpactScreen(), FakeImpactRepository());
      expect(find.text('Year by year'), findsOneWidget);
      expect(find.text('2026'), findsOneWidget);
      expect(find.text('Repaired 4 · Recycled 3'), findsOneWidget);
      expect(find.text('By kind of device'), findsOneWidget);
      expect(find.text('Laptop'), findsOneWidget);
      expect(find.text('Other'), findsOneWidget);
      final semantics = tester.ensureSemantics();
      await tester.pump();
      expect(find.bySemanticsLabel(RegExp('2026: 7 devices, Repaired 4')),
          findsOneWidget);
      semantics.dispose();
    });

    testWidgets(
        'are left out when there is nothing yet, or they cannot be loaded, without spoiling the rest',
        (tester) async {
      final repo = FakeImpactRepository()
        ..yearRows = const [BreakdownRow(key: '2026', label: '2026')]
        ..categoryRows = const [];
      await _pump(tester, const ImpactScreen(), repo);
      expect(find.text('Year by year'), findsNothing);
      expect(find.text('By kind of device'), findsNothing);
      expect(find.text('devices kept in use'), findsOneWidget);
    });

    testWidgets('a failed fetch leaves them out and keeps the page',
        (tester) async {
      final repo = FakeImpactRepository()
        ..breakdownError = const ApiException('Cannot reach the server',
            failure: ApiFailure.network);
      await _pump(tester, const ImpactScreen(), repo);
      expect(find.text('Year by year'), findsNothing);
      expect(find.text('devices kept in use'), findsOneWidget);
    });

    testWidgets('fit at the largest text size', (tester) async {
      await _pump(tester, const ImpactScreen(), FakeImpactRepository(),
          scale: 2);
      expect(tester.takeException(), isNull);
    });
  });

  group('the breakdown rows', () {
    test('read a year and a category, with "Other" for none', () {
      final y = BreakdownRow.year({
        'year': 2026,
        'devices': 7,
        'byType': {'repair': 4, 'recycling': 3, 'reuse': 0}
      });
      expect([y.label, y.devices, y.detail],
          ['2026', 7, 'Repaired 4 · Recycled 3']);
      expect(
          BreakdownRow.category({'category': null, 'devices': 2, 'byType': {}})
              .label,
          'Other');
      expect(
          BreakdownRow.category({
            'category': {'_id': 'c1', 'name': 'Laptop'},
            'devices': 1
          }).key,
          'c1');
      expect(BreakdownRow.year({}).label, '');
      expect(hasActivity([y]), isTrue);
      expect(hasActivity(const []), isFalse);
    });
  });
}
