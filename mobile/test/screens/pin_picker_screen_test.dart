import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:material_ui/material_ui.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:ewaste_opportunity/providers/location_providers.dart';
import 'package:ewaste_opportunity/screens/location/pin_picker_screen.dart';
import 'package:ewaste_opportunity/services/location_service.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';

import '../fakes.dart';

/// Opens the picker from a plain page, the way the listing form does, and keeps what it pops with.
Future<GeoPoint? Function()> _open(WidgetTester tester, FakeGeoRepository geo) async {
  GeoPoint? result;
  final router = GoRouter(
    routes: [
      GoRoute(
        path: '/',
        builder: (context, _) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () async => result = await context.push<GeoPoint>('/pick'),
              child: const Text('Open picker'),
            ),
          ),
        ),
      ),
      GoRoute(path: '/pick', builder: (_, __) => const PinPickerScreen()),
    ],
  );
  addTearDown(router.dispose);
  tester.view.physicalSize = const Size(900, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [geoRepositoryProvider.overrideWithValue(geo)],
      child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
    ),
  );
  return () => result;
}

void main() {
  testWidgets('searching an address puts the pin there and "Use this spot" hands it back', (tester) async {
    final geo = FakeGeoRepository();
    final result = await _open(tester, geo);
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.text('Open picker'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.text('Search above, or tap the map where the device is.'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Search an address or place'), 'Indiranagar');
    await tester.tap(find.byTooltip('Search'));
    await tester.pump(const Duration(milliseconds: 100));
    expect(geo.searched.single, 'Indiranagar');
    await tester.tap(find.text('Indiranagar, Bengaluru, Karnataka, India').last);
    await tester.pump(const Duration(milliseconds: 200));
    expect(find.text('Pin at 12.97160, 77.64123'), findsOneWidget);

    await tester.tap(find.text('Use this spot'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(result(), const GeoPoint(12.9716, 77.64123));
  });

  testWidgets('says plainly when the address service is out of reach, and the map still works', (tester) async {
    final geo = FakeGeoRepository()..error = const ApiException('Address search is unavailable.', failure: ApiFailure.server, statusCode: 503);
    await _open(tester, geo);
    await tester.pump(const Duration(milliseconds: 50));
    await tester.tap(find.text('Open picker'));
    await tester.pump(const Duration(milliseconds: 400));
    await tester.enterText(find.widgetWithText(TextField, 'Search an address or place'), 'somewhere');
    await tester.tap(find.byTooltip('Search'));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.textContaining('Address search is unavailable.'), findsOneWidget);
    expect(find.text('Use this spot'), findsOneWidget); // still there, disabled until a pin is dropped
    expect(tester.takeException(), isNull);
  });
}
