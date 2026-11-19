import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/models/recycling_report.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/listings_controller.dart';
import 'package:ewaste_opportunity/providers/recycling_providers.dart';
import 'package:ewaste_opportunity/routes/route_paths.dart';
import 'package:ewaste_opportunity/screens/recycling/recycling_report_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';
import '../models/recycling_report_models_test.dart';

Future<void> _pump(WidgetTester tester, Widget screen, {FakeRecyclingRepository? recycling}) async {
  tester.view.physicalSize = const Size(900, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, __) => Scaffold(body: screen)),
      GoRoute(
        path: Routes.recyclingRequestPattern,
        builder: (_, state) => Scaffold(body: Text('Opened request ${state.pathParameters['id']}')),
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
        recyclingRepositoryProvider.overrideWithValue(recycling ?? FakeRecyclingRepository()),
        deviceRepositoryProvider.overrideWithValue(FakeDeviceRepository()),
        categoriesProvider.overrideWith((ref) async => const [
              Category(id: 'c1', name: 'Phones', slug: 'phones'),
              Category(id: 'c2', name: 'Laptops', slug: 'laptops')
            ]),
      ],
      child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
    ),
  );
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 50));
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  group('the recycling report', () {
    testWidgets('shows requests, completions and the materials with measured and estimated apart', (tester) async {
      final repo = FakeRecyclingRepository()..reportData = RecyclingReport.fromJson(reportJson());
      await _pump(tester, const RecyclingReportScreen(), recycling: repo);

      expect(find.text('GreenCycle Recyclers'), findsOneWidget);
      expect(find.text('Requests received'), findsOneWidget);
      expect(find.text('Requests completed'), findsOneWidget);
      expect(find.text('Devices recycled'), findsOneWidget);
      expect(find.text('Request status'), findsOneWidget);
      expect(find.text('Measured'), findsOneWidget);
      expect(find.text('Estimated'), findsOneWidget);
      expect(find.text('Copper'), findsOneWidget);
      expect(find.text('Measured: 3.25 kg'), findsOneWidget);
      expect(find.text('Estimated: 1.5 kg'), findsOneWidget);
      await _tap(tester, find.text('REC-2026-0001'));
      expect(find.text('Opened request r1'), findsOneWidget);
    });

    testWidgets('a period chip asks for that period', (tester) async {
      final repo = FakeRecyclingRepository()..reportData = RecyclingReport.fromJson(reportJson());
      await _pump(tester, const RecyclingReportScreen(), recycling: repo);
      expect(repo.reportCalls.first.from, isNull);

      await _tap(tester, find.widgetWithText(ChoiceChip, 'Last 30 days'));
      expect(repo.reportCalls.last.from, isNotNull);
      expect(repo.reportCalls.last.to, isNotNull);
    });

    testWidgets('an empty period says nothing was recorded', (tester) async {
      final repo = FakeRecyclingRepository()..reportData = RecyclingReport.fromJson(reportJson(empty: true));
      await _pump(tester, const RecyclingReportScreen(), recycling: repo);
      expect(find.text('No materials were recorded in this period.'), findsOneWidget);
    });
  });
}
