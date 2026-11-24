import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/geo_place.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/providers/listings_controller.dart';
import 'package:ewaste_opportunity/providers/location_providers.dart';
import 'package:ewaste_opportunity/screens/devices/filter_sheet.dart';
import 'package:ewaste_opportunity/services/device_repository.dart';
import 'package:ewaste_opportunity/services/location_service.dart';
import 'package:ewaste_opportunity/widgets/location_field.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';

const _bengaluru = GeoPoint(12.9716, 77.5946);

Future<void> _pumpField(WidgetTester tester, FakeLocationService phone, {GeoPoint? value, required ValueChanged<GeoPoint?> onChanged, void Function(GeoPoint, GeoPlace?)? onDetected, FakeGeoRepository? geo}) async {
  await tester.pumpWidget(
    ProviderScope(
      overrides: [locationServiceProvider.overrideWithValue(phone), geoRepositoryProvider.overrideWithValue(geo ?? FakeGeoRepository())],
      child: MaterialApp(theme: AppTheme.light(), home: Scaffold(body: SingleChildScrollView(child: LocationField(value: value, onChanged: onChanged, onDetected: onDetected)))),
    ),
  );
}

/// A phone whose GPS is off at first and comes on once the person has been to the settings.
class _GpsComesOn implements LocationService {
  bool on = false;
  int asked = 0;
  int switchOpened = 0;

  @override
  Future<LocationResult> current() async {
    asked++;
    return on ? const LocationResult.found(_bengaluru) : const LocationResult.failed(LocationProblem.serviceOff);
  }

  @override
  Future<void> openAppSettings() async {}

  @override
  Future<void> openLocationSettings() async => switchOpened++;
}

/// Opens the Browse filter sheet. What it returns when closed lands in [chosen].
class _Sheet {
  ListingQuery? chosen;
}

Future<_Sheet> _openSheet(WidgetTester tester, FakeLocationService phone, {ListingQuery initial = const ListingQuery()}) async {
  final sheet = _Sheet();
  // Tall enough that the whole sheet, down to "Show results", is on screen.
  tester.view.physicalSize = const Size(800, 1800);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [locationServiceProvider.overrideWithValue(phone), categoriesProvider.overrideWith((ref) async => const <Category>[])],
      child: MaterialApp(
        theme: AppTheme.light(),
        home: Builder(
          builder: (context) => Scaffold(
            body: FilledButton(onPressed: () async => sheet.chosen = await FilterSheet.show(context, initial), child: const Text('Open')),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('Open'));
  await tester.pumpAndSettle();
  return sheet;
}

void main() {
  group('LocationField', () {
    testWidgets('"Detect my current location" hands the position and the address to the screen', (tester) async {
      final phone = FakeLocationService.at(_bengaluru);
      GeoPoint? got;
      GeoPlace? gotPlace;
      await _pumpField(tester, phone, onChanged: (_) {}, onDetected: (p, place) {
        got = p;
        gotPlace = place;
      });

      await tester.tap(find.text('Detect my current location'));
      await tester.pumpAndSettle();

      expect(got, _bengaluru);
      expect(gotPlace?.area, 'Indiranagar');
      expect(gotPlace?.city, 'Bengaluru');
      expect(phone.asked, 1);
      expect(find.text('Location detected: Indiranagar, Bengaluru'), findsOneWidget);
    });

    testWidgets('without a handler for the address, the position goes to onChanged', (tester) async {
      GeoPoint? got;
      await _pumpField(tester, FakeLocationService.at(_bengaluru), onChanged: (p) => got = p);
      await tester.tap(find.text('Detect my current location'));
      await tester.pumpAndSettle();
      expect(got, _bengaluru);
    });

    testWidgets('a saved position is shown and can be removed', (tester) async {
      GeoPoint? got = _bengaluru;
      await _pumpField(tester, FakeLocationService.at(_bengaluru), value: _bengaluru, onChanged: (p) => got = p);

      expect(find.text('Location saved (12.97160, 77.59460)'), findsOneWidget);
      await tester.tap(find.text('Remove'));
      expect(got, isNull);
    });

    testWidgets('GPS off: an alert asks to turn it on, and the phone\'s location switch opens', (tester) async {
      final phone = FakeLocationService.failing(LocationProblem.serviceOff);
      GeoPoint? got;
      await _pumpField(tester, phone, onChanged: (p) => got = p);

      await tester.tap(find.text('Detect my current location'));
      await tester.pumpAndSettle();

      expect(find.byType(AlertDialog), findsOneWidget);
      expect(find.text('Turn on GPS'), findsNWidgets(2)); // the alert's title and its button
      expect(find.textContaining('Location is switched off on your phone'), findsOneWidget);
      expect(got, isNull);

      await tester.tap(find.widgetWithText(FilledButton, 'Turn on GPS'));
      await tester.pumpAndSettle();
      expect(phone.locationSettingsOpened, 1);
      expect(find.byType(AlertDialog), findsNothing);
    });

    testWidgets('GPS off: after the person turns it on and comes back, it detects by itself', (tester) async {
      final phone = _GpsComesOn();
      GeoPoint? got;
      GeoPlace? gotPlace;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [locationServiceProvider.overrideWithValue(phone), geoRepositoryProvider.overrideWithValue(FakeGeoRepository())],
          child: MaterialApp(
            theme: AppTheme.light(),
            home: Scaffold(
              body: SingleChildScrollView(
                child: LocationField(value: null, onChanged: (_) {}, onDetected: (p, place) {
                  got = p;
                  gotPlace = place;
                }),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Detect my current location'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(FilledButton, 'Turn on GPS'));
      await tester.pumpAndSettle();
      expect(phone.switchOpened, 1);
      expect(got, isNull);

      // The person switches GPS on in the settings and returns to the app.
      phone.on = true;
      tester.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pumpAndSettle();

      expect(phone.asked, 2);
      expect(got, _bengaluru);
      expect(gotPlace?.city, 'Bengaluru');
    });

    testWidgets('GPS off: "Not now" closes the alert and opens nothing', (tester) async {
      final phone = FakeLocationService.failing(LocationProblem.serviceOff);
      await _pumpField(tester, phone, onChanged: (_) {});

      await tester.tap(find.text('Detect my current location'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Not now'));
      await tester.pumpAndSettle();

      expect(phone.locationSettingsOpened, 0);
      expect(find.byType(AlertDialog), findsNothing);
    });

    testWidgets('refused once: explains and offers another try', (tester) async {
      final phone = FakeLocationService.failing(LocationProblem.denied);
      GeoPoint? got;
      await _pumpField(tester, phone, onChanged: (p) => got = p);

      await tester.tap(find.text('Detect my current location'));
      await tester.pumpAndSettle();
      expect(find.textContaining('needs permission'), findsOneWidget);
      expect(got, isNull);

      await tester.tap(find.widgetWithText(FilledButton, 'Try again'));
      await tester.pumpAndSettle();
      expect(phone.asked, 2);
    });

    testWidgets('blocked for good: the way out is the phone settings', (tester) async {
      final phone = FakeLocationService.failing(LocationProblem.deniedForever);
      await _pumpField(tester, phone, onChanged: (_) {});

      await tester.tap(find.text('Detect my current location'));
      await tester.pumpAndSettle();
      expect(find.textContaining('blocked for this app'), findsOneWidget);

      await tester.tap(find.widgetWithText(FilledButton, 'Open settings'));
      await tester.pumpAndSettle();
      expect(phone.appSettingsOpened, 1);
    });

    testWidgets('no signal: says the phone could not find itself', (tester) async {
      await _pumpField(tester, FakeLocationService.failing(LocationProblem.unavailable), onChanged: (_) {});

      await tester.tap(find.text('Detect my current location'));
      await tester.pumpAndSettle();
      expect(find.textContaining('could not find where it is'), findsOneWidget);
    });

    testWidgets('when the address lookup is out of reach the spot is still kept and the person is told to type', (tester) async {
      GeoPoint? got;
      GeoPlace? gotPlace = const GeoPlace(area: 'x');
      await _pumpField(tester, FakeLocationService.at(_bengaluru), geo: FakeGeoRepository(place: null), onChanged: (_) {}, onDetected: (p, place) {
        got = p;
        gotPlace = place;
      });
      await tester.tap(find.text('Detect my current location'));
      await tester.pumpAndSettle();

      expect(got, _bengaluru);
      expect(gotPlace, isNull);
      expect(find.textContaining('could not look up the address'), findsOneWidget);
    });
  });

  group('FilterSheet near me', () {
    testWidgets('choosing a distance asks the phone and applies the point', (tester) async {
      final phone = FakeLocationService.at(_bengaluru);
      final sheet = await _openSheet(tester, phone);

      await tester.tap(find.text('10 km'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Show results'));
      await tester.pumpAndSettle();

      expect(sheet.chosen?.lat, 12.9716);
      expect(sheet.chosen?.lng, 77.5946);
      expect(sheet.chosen?.radiusKm, 10);
      expect(phone.asked, 1);
    });

    testWidgets('a refused location leaves the chip off, says why, and still shows results', (tester) async {
      final sheet = await _openSheet(tester, FakeLocationService.failing(LocationProblem.denied));

      await tester.tap(find.text('25 km'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Location was not allowed'), findsOneWidget);

      await tester.tap(find.text('Show results'));
      await tester.pumpAndSettle();
      expect(sheet.chosen?.hasNearby, isFalse);
    });

    testWidgets('"Any distance" switches near me off again without asking the phone', (tester) async {
      final phone = FakeLocationService.at(_bengaluru);
      final sheet = await _openSheet(tester, phone, initial: const ListingQuery(lat: 1, lng: 2, radiusKm: 5));

      await tester.tap(find.text('Any distance'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Show results'));
      await tester.pumpAndSettle();

      expect(sheet.chosen?.hasNearby, isFalse);
      expect(phone.asked, 0);
    });

    testWidgets('a different distance reuses the point already found', (tester) async {
      final phone = FakeLocationService.at(_bengaluru);
      final sheet = await _openSheet(tester, phone, initial: const ListingQuery(lat: 12.9, lng: 77.5, radiusKm: 5));

      await tester.tap(find.text('50 km'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Show results'));
      await tester.pumpAndSettle();

      expect(sheet.chosen?.radiusKm, 50);
      expect(sheet.chosen?.lat, 12.9);
      expect(phone.asked, 0);
    });
  });
}
