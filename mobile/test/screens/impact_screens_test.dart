import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/user.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/impact_providers.dart';
import 'package:ewaste_opportunity/routes/route_paths.dart';
import 'package:ewaste_opportunity/screens/home/home_screen.dart';
import 'package:ewaste_opportunity/screens/impact/impact_screen.dart';
import 'package:ewaste_opportunity/widgets/green_ring.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';

Future<void> _pump(WidgetTester tester, Widget screen, FakeImpactRepository repo, {UserRole role = UserRole.user, double scale = 1}) async {
  tester.view.physicalSize = const Size(380, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, __) => Scaffold(body: screen)),
    GoRoute(path: Routes.impact, builder: (_, __) => const Scaffold(body: Text('IMPACT PAGE'))),
  ]);
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository(loginResult: sampleMe(role: role))),
        impactRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp.router(
        theme: AppTheme.light(),
        routerConfig: router,
        builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
      ),
    ),
  );
  final container = ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
  await container.read(authControllerProvider.notifier).signIn(email: 'asha@example.com', password: 'x');
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  group('the Green Score card on Home', () {
    testWidgets('shows the ring, the level and how far to the next one', (tester) async {
      await _pump(tester, const HomeScreen(), FakeImpactRepository());
      expect(find.text('Green Score'), findsOneWidget);
      expect(find.text('Seed · 8 points to Sprout'), findsOneWidget);
      expect(find.byType(GreenRing), findsOneWidget);
      expect(find.text('92'), findsOneWidget);
      expect(find.text('Soon'), findsNothing);
    });

    testWidgets('a new person is told how to start, not shown a made-up number', (tester) async {
      final repo = FakeImpactRepository(score: greenScoreJson(score: 0, progress: 0, withLedger: false, badges: const []));
      await _pump(tester, const HomeScreen(), repo);
      expect(find.text('Complete an activity to start earning points.'), findsOneWidget);
      expect(find.text('0'), findsOneWidget);
    });

    testWidgets('opens the full page when tapped', (tester) async {
      await _pump(tester, const HomeScreen(), FakeImpactRepository());
      await tester.tap(find.text('Seed · 8 points to Sprout'));
      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(find.text('IMPACT PAGE'), findsOneWidget);
    });

    testWidgets('when the score cannot be fetched it still opens the page, and says nothing false', (tester) async {
      final repo = FakeImpactRepository()..error = const ApiException('Cannot reach the server', failure: ApiFailure.network);
      await _pump(tester, const HomeScreen(), repo);
      expect(find.text('Tap to see your score.'), findsOneWidget);
      expect(find.byType(GreenRing), findsNothing);
    });

    testWidgets('is there for technicians too, who earn points for repairs, but not for administrators', (tester) async {
      await _pump(tester, const HomeScreen(), FakeImpactRepository(), role: UserRole.technician);
      expect(find.text('Seed · 8 points to Sprout'), findsOneWidget);
    });

    testWidgets('fits at the largest text size', (tester) async {
      await _pump(tester, const HomeScreen(), FakeImpactRepository(), scale: 2);
      expect(tester.takeException(), isNull);
      expect(find.text('Seed · 8 points to Sprout'), findsOneWidget);
    });

    testWidgets('administrators do not get one', (tester) async {
      await _pump(tester, const HomeScreen(), FakeImpactRepository(), role: UserRole.admin);
      expect(find.textContaining('Green Score'), findsNothing);
    });
  });

  group('the Impact screen', () {
    testWidgets('shows the score, level and what is needed for the next one', (tester) async {
      await _pump(tester, const ImpactScreen(), FakeImpactRepository());
      expect(find.text('Seed'), findsOneWidget);
      expect(find.text('8 more points to reach Sprout.'), findsOneWidget);
      expect(find.byType(GreenRing), findsOneWidget);
    });

    testWidgets('says the top level is the top', (tester) async {
      final json = greenScoreJson(score: 1200)
        ..['level'] = {'key': 'forest', 'name': 'Forest', 'min': 1000, 'next': null, 'progress': 1};
      await _pump(tester, const ImpactScreen(), FakeImpactRepository(score: json));
      expect(find.text('You have reached the highest level.'), findsOneWidget);
    });

    testWidgets('shows which badges are earned and how far the others are', (tester) async {
      await _pump(tester, const ImpactScreen(), FakeImpactRepository());
      expect(find.text('1 of 3 earned'), findsOneWidget);
      expect(find.text('First repair'), findsOneWidget);
      expect(find.text('0 of 1'), findsOneWidget); // Donor
      expect(find.text('2.5 of 10'), findsOneWidget); // Material saver
      expect(find.byIcon(Icons.workspace_premium), findsOneWidget);
      expect(find.byIcon(Icons.lock_outline), findsNWidgets(2));
    });

    testWidgets('keeps actual, measured and estimated figures apart and labels each', (tester) async {
      await _pump(tester, const ImpactScreen(), FakeImpactRepository());
      expect(find.text('3'), findsWidgets);
      expect(find.text('devices kept in use'), findsOneWidget);
      expect(find.text('Actual'), findsOneWidget);
      expect(find.text('1.5 kg'), findsOneWidget);
      expect(find.text('Measured'), findsOneWidget);
      expect(find.text('2 kg'), findsOneWidget);
      expect(find.text('150 kg'), findsOneWidget);
      expect(find.text('Estimate'), findsNWidgets(2)); // the unweighed materials and the CO2e
      expect(find.textContaining('not sourced yet'), findsOneWidget);
      expect(find.text('Repaired 1'), findsOneWidget);
      expect(find.text('Donated 2'), findsOneWidget);
      expect(find.textContaining('Reused'), findsNothing); // kinds with nothing are left out
    });

    testWidgets('a person with no activity sees an honest "nothing yet"', (tester) async {
      final repo = FakeImpactRepository(
        score: greenScoreJson(score: 0, progress: 0, withLedger: false, badges: const []),
        summary: impactJson(devices: 0, measured: 0, estimated: 0, co2e: 0),
        months: [{'month': '2026-10', 'devices': 0, 'byType': {}}, {'month': '2026-11', 'devices': 0, 'byType': {}}],
      );
      await _pump(tester, const ImpactScreen(), repo);
      expect(find.textContaining('Nothing yet. When a repair'), findsOneWidget);
      expect(find.text('Nothing in the last 2 months.'), findsOneWidget);
      expect(find.text('Nothing earned yet.'), findsOneWidget);
    });

    testWidgets('draws the monthly chart when there is activity', (tester) async {
      await _pump(tester, const ImpactScreen(), FakeImpactRepository());
      expect(find.text('Month by month'), findsOneWidget);
      expect(find.bySemanticsLabel(RegExp('Bar chart of devices kept in use by month')), findsOneWidget);
    });

    testWidgets('lists how points were earned, newest first, with a reversal shown as a loss', (tester) async {
      final json = greenScoreJson()
        ..['ledger'] = [
          {'_id': 'l3', 'points': -50, 'rule': 'reversal', 'label': 'Removed: a complaint about this was upheld', 'createdAt': '2026-11-17T09:00:00.000Z'},
          {'_id': 'l1', 'points': 50, 'rule': 'repair_completed', 'label': 'A repair you asked for was completed', 'createdAt': '2026-11-15T09:00:00.000Z'},
        ];
      await _pump(tester, const ImpactScreen(), FakeImpactRepository(score: json));
      expect(find.text('How you earned it'), findsOneWidget);
      expect(find.text('-50'), findsOneWidget);
      expect(find.text('+50'), findsOneWidget);
      expect(find.text('Removed: a complaint about this was upheld'), findsOneWidget);
      expect(tester.getTopLeft(find.text('-50')).dy, lessThan(tester.getTopLeft(find.text('+50')).dy));
    });

    testWidgets('brings in older history on request', (tester) async {
      final repo = FakeImpactRepository(ledgerPages: 2);
      await _pump(tester, const ImpactScreen(), repo);
      await tester.ensureVisible(find.text('Show more'));
      await tester.tap(find.text('Show more'));
      for (var i = 0; i < 4; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(find.text('Older entry 2'), findsOneWidget);
      expect(repo.pagesAsked, containsAll([1, 2]));
      expect(find.text('Show more'), findsNothing);
    });

    testWidgets('explains how points work, from the server\'s own rules', (tester) async {
      await _pump(tester, const ImpactScreen(), FakeImpactRepository());
      await tester.ensureVisible(find.text('How points work'));
      await tester.tap(find.text('How points work'));
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(find.text('+50'), findsWidgets);
      expect(find.textContaining('Points come only from activities the other side has confirmed'), findsOneWidget);
    });

    testWidgets('says why it cannot load, and loads when retried', (tester) async {
      final repo = FakeImpactRepository()..error = const ApiException('Cannot reach the server', failure: ApiFailure.network);
      await _pump(tester, const ImpactScreen(), repo);
      expect(find.textContaining('Cannot reach the server'), findsWidgets);

      repo.error = null;
      await tester.tap(find.text('Try again').first);
      for (var i = 0; i < 6; i++) {
        await tester.pump(const Duration(milliseconds: 100));
      }
      expect(find.text('Seed'), findsOneWidget);
    });

    testWidgets('fits on a small phone with large text', (tester) async {
      await _pump(tester, const ImpactScreen(), FakeImpactRepository(), scale: 2);
      expect(tester.takeException(), isNull);
    });
  });
}
