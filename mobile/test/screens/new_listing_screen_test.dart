import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/listings_controller.dart';
import 'package:ewaste_opportunity/providers/location_providers.dart';
import 'package:ewaste_opportunity/providers/photo_providers.dart';
import 'package:ewaste_opportunity/routes/route_paths.dart';
import 'package:ewaste_opportunity/screens/devices/new_listing_screen.dart';
import 'package:ewaste_opportunity/services/location_service.dart';
import 'package:ewaste_opportunity/services/photo_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';

const _good = PickedPhoto(
    path: '/none/front.jpg',
    name: 'front.jpg',
    mime: 'image/jpeg',
    bytes: 2000);
const _gif = PickedPhoto(
    path: '/none/fun.gif', name: 'fun.gif', mime: 'image/gif', bytes: 2000);
const _huge = PickedPhoto(
    path: '/none/big.jpg',
    name: 'big.jpg',
    mime: 'image/jpeg',
    bytes: 6 * 1024 * 1024);

Future<void> _pump(
    WidgetTester tester, FakeDeviceRepository repo, FakePhotoPicker picker,
    {FakeLocationService? phone,
    FakeGeoRepository? geo}) async {
  tester.view.physicalSize = const Size(900, 2600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: Routes.newListing,
    routes: [
      GoRoute(
          path: Routes.newListing,
          builder: (_, __) => const NewListingScreen()),
      GoRoute(
          path: Routes.listingPattern,
          builder: (_, state) =>
              Scaffold(body: Text('Opened ${state.pathParameters['id']}'))),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
        deviceRepositoryProvider.overrideWithValue(repo),
        photoPickerProvider.overrideWithValue(picker),
        geoRepositoryProvider.overrideWithValue(geo ?? FakeGeoRepository()),
        if (phone != null) locationServiceProvider.overrideWithValue(phone),
      ],
      child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
    ),
  );
  await tester.pump(const Duration(milliseconds: 50));
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.tap(finder);
  await tester.pump(const Duration(milliseconds: 100));
}

FakeDeviceRepository _repo() => FakeDeviceRepository(categoryList: const [
      Category(id: 'c1', name: 'Phones', slug: 'phones'),
      Category(id: 'c2', name: 'Laptops', slug: 'laptops'),
    ]);

Future<void> _goToDeviceStep(WidgetTester tester) async {
  // A photo is needed before the device step; add one when the test has not.
  if (find.text('0 of 6 photos').evaluate().isNotEmpty) {
    await _tap(tester, find.text('Gallery'));
  }
  await _tap(tester, find.widgetWithText(FilledButton, 'Next'));
}

/// The details a device needs besides its name (brand, model and year bought).
Future<void> _fillRest(WidgetTester tester) async {
  await tester.enterText(find.widgetWithText(TextFormField, 'Brand'), 'Samsung');
  await tester.enterText(find.widgetWithText(TextFormField, 'Model'), 'Galaxy A12');
  await tester.enterText(find.widgetWithText(TextFormField, 'Model year (when this model came out)'), '2019');
  await tester.enterText(find.widgetWithText(TextFormField, 'Year bought (same as or after the model year)'), '2020');
}

/// The place a listing now needs, when the last step is showing.
Future<void> _fillPlace(WidgetTester tester) async {
  final city = find.widgetWithText(TextFormField, 'City');
  if (city.evaluate().isEmpty) return;
  await tester.enterText(city, 'Bengaluru');
  await tester.enterText(find.widgetWithText(TextFormField, 'Area or neighbourhood'), 'Indiranagar');
  await tester.enterText(find.widgetWithText(TextFormField, 'Your phone number'), '98765 43210');
  await _tickChecklist(tester);
}

/// Ticks the three data-protection boxes on the last step.
Future<void> _tickChecklist(WidgetTester tester) async {
  final boxes = find.byType(CheckboxListTile);
  for (var i = 0; i < boxes.evaluate().length; i++) {
    if (tester.widget<CheckboxListTile>(boxes.at(i)).value == true) continue; // already ticked
    await tester.ensureVisible(boxes.at(i));
    await tester.tap(boxes.at(i));
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  testWidgets(
      'photos: the gallery adds good photos and explains why others were skipped',
      (tester) async {
    final picker = FakePhotoPicker(gallery: [_good, _gif, _huge]);
    await _pump(tester, _repo(), picker);

    expect(find.text('0 of 6 photos'), findsOneWidget);
    await _tap(tester, find.text('Gallery'));

    expect(picker.galleryCalls, 1);
    expect(find.text('1 of 6 photos'), findsOneWidget);
    expect(find.textContaining('fun.gif'), findsOneWidget);
    expect(find.textContaining('big.jpg'), findsOneWidget);
  });

  testWidgets('photos: the camera adds one, and a photo can be removed',
      (tester) async {
    final picker = FakePhotoPicker(camera: _good);
    await _pump(tester, _repo(), picker);

    await _tap(tester, find.text('Take a photo'));
    expect(picker.cameraCalls, 1);
    expect(find.text('1 of 6 photos'), findsOneWidget);

    await _tap(tester, find.byTooltip('Remove photo 1'));
    expect(find.text('0 of 6 photos'), findsOneWidget);
  });

  testWidgets('photos: the first step will not move on without a photo',
      (tester) async {
    await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]));
    await _tap(tester, find.widgetWithText(FilledButton, 'Next'));
    expect(find.text('Add at least one photo of the device.'), findsOneWidget);
    expect(find.text('The device'), findsNothing);

    await _tap(tester, find.text('Gallery'));
    await _tap(tester, find.widgetWithText(FilledButton, 'Next'));
    expect(find.text('The device'), findsOneWidget);
  });

  testWidgets('the last step will not go on until all three data-protection boxes are ticked', (tester) async {
    final repo = _repo();
    await _pump(tester, repo, FakePhotoPicker(gallery: [_good]));
    await _goToDeviceStep(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Galaxy A12');
    await _fillRest(tester);
    await _tap(tester, find.text('Phones'));
    await _tap(tester, find.text('Minor damage'));
    await _tap(tester, find.widgetWithText(FilledButton, 'Next'));
    await _tap(tester, find.text('Repair'));
    // Everything else is filled in; only the boxes are missing.
    await tester.enterText(find.widgetWithText(TextFormField, 'City'), 'Bengaluru');
    await tester.enterText(find.widgetWithText(TextFormField, 'Area or neighbourhood'), 'Indiranagar');
    await tester.enterText(find.widgetWithText(TextFormField, 'Your phone number'), '98765 43210');
    final boxes = find.byType(CheckboxListTile);
    expect(boxes, findsNWidgets(3));

    await _tap(tester, find.widgetWithText(FilledButton, 'Publish listing'));
    expect(find.text('Please tick all three boxes to continue.'), findsOneWidget);
    expect(repo.created, isEmpty);

    for (var i = 0; i < 2; i++) {
      await tester.ensureVisible(boxes.at(i));
      await tester.tap(boxes.at(i));
      await tester.pump(const Duration(milliseconds: 50));
    }
    await _tap(tester, find.text('Save as draft'));
    expect(find.text('Please tick all three boxes to continue.'), findsOneWidget);
    expect(repo.created, isEmpty);

    await tester.ensureVisible(boxes.at(2));
    await tester.tap(boxes.at(2));
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.text('Please tick all three boxes to continue.'), findsNothing);
    await _tap(tester, find.text('Save as draft'));
    await tester.pump(const Duration(milliseconds: 300));
    expect(repo.created, hasLength(1));
  });

  testWidgets('the last step needs the city and the area, and checks them',
      (tester) async {
    await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]));
    await _goToDeviceStep(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Galaxy A12');
    await _fillRest(tester);
    await _tap(tester, find.text('Phones'));
    await _tap(tester, find.text('Minor damage'));
    await _tap(tester, find.widgetWithText(FilledButton, 'Next'));
    await _tap(tester, find.text('Repair'));
    await _tap(tester, find.widgetWithText(FilledButton, 'Publish listing'));
    expect(find.text('Enter the city'), findsOneWidget);
    expect(find.textContaining('Enter the area or locality'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextFormField, 'City'), '560038');
    await tester.enterText(find.widgetWithText(TextFormField, 'Area or neighbourhood'), '12');
    await _tap(tester, find.widgetWithText(FilledButton, 'Publish listing'));
    expect(find.text('The city can only have letters'), findsOneWidget);
    expect(find.textContaining('Enter the area or locality'), findsOneWidget);
  });

  testWidgets('photos: no more than six', (tester) async {
    final picker = FakePhotoPicker(gallery: List.filled(8, _good));
    await _pump(tester, _repo(), picker);

    await _tap(tester, find.text('Gallery'));

    expect(find.text('6 of 6 photos'), findsOneWidget);
    final button = tester
        .widget<OutlinedButton>(find.widgetWithText(OutlinedButton, 'Gallery'));
    expect(button.onPressed, isNull);
  });

  testWidgets(
      'the device step will not move on without a name, a category and a condition',
      (tester) async {
    await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]));
    await _goToDeviceStep(tester);
    expect(find.text('The device'), findsOneWidget);

    await _tap(tester, find.widgetWithText(FilledButton, 'Next'));

    expect(find.textContaining('Give the device a name'), findsOneWidget);
    expect(find.text('Choose a category'), findsOneWidget);
    expect(find.text('Choose the condition'), findsOneWidget);
    expect(find.textContaining('Enter the brand'), findsOneWidget);
    expect(find.textContaining('Enter the model'), findsOneWidget);
    expect(find.text('Enter the year this model came out'), findsOneWidget);
    expect(find.text('Enter the year it was bought'), findsOneWidget);
    expect(find.text('What you want'), findsNothing);
  });

  testWidgets(
      'a full walk-through publishes the listing with its photos and opens it',
      (tester) async {
    final repo = _repo();
    await _pump(tester, repo, FakePhotoPicker(gallery: [_good]));

    await _tap(tester, find.text('Gallery'));
    await _goToDeviceStep(tester);

    await tester.enterText(
        find.widgetWithText(TextFormField, 'Device name'), 'Galaxy A12');
    await _fillRest(tester);
    await _tap(tester, find.text('Phones'));
    await _tap(tester, find.text('Minor damage'));
    await _tap(tester, find.widgetWithText(FilledButton, 'Next'));
    expect(find.text('What you want'), findsOneWidget);

    // The last step needs a service.
    await _fillPlace(tester);
    await _tap(tester, find.widgetWithText(FilledButton, 'Publish listing'));
    expect(find.text('Choose what you want to do with it'), findsOneWidget);
    expect(repo.created, isEmpty);

    await _tap(tester, find.text('Repair'));
    await tester.enterText(
        find.widgetWithText(
            TextFormField, 'Asking price in ₹ (optional, 0 for free)'),
        '1,200');
    await _fillPlace(tester);
    await _tap(tester, find.widgetWithText(FilledButton, 'Publish listing'));
    await tester.pump(const Duration(milliseconds: 300));

    final sent = repo.created.single;
    expect(sent.name, 'Galaxy A12');
    expect(sent.category, 'phones');
    expect(sent.condition, 'minor_damage');
    expect(sent.preferredService, 'repair');
    expect(sent.draft, isFalse);
    expect(sent.toFields()['expectedPrice'], '1200');
    expect(repo.createdPhotos.single, hasLength(1));
    expect(find.text('Opened new1'), findsOneWidget);
  });

  testWidgets('"Save as draft" sends a draft', (tester) async {
    final repo = _repo();
    await _pump(tester, repo, FakePhotoPicker(gallery: [_good]));

    await _goToDeviceStep(tester);
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Device name'), 'Old router');
    await _fillRest(tester);
    await _tap(tester, find.text('Laptops'));
    await _tap(tester, find.text('Not working'));
    await _tap(tester, find.widgetWithText(FilledButton, 'Next'));
    await _tap(tester, find.text('Recycling'));
    await _fillPlace(tester);
    await _tap(tester, find.text('Save as draft'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(repo.created.single.draft, isTrue);
    expect(repo.created.single.toFields()['status'], 'draft');
  });

  testWidgets('a server error on a field takes the person back to that step',
      (tester) async {
    final repo = _repo()
      ..createError = const ApiException('Validation failed',
          failure: ApiFailure.validation,
          statusCode: 422,
          fieldErrors: {'name': 'That name is not allowed'});
    await _pump(tester, repo, FakePhotoPicker(gallery: [_good]));

    await _goToDeviceStep(tester);
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Device name'), 'Bad name');
    await _fillRest(tester);
    await _tap(tester, find.text('Phones'));
    await _tap(tester, find.text('Fully working'));
    await _tap(tester, find.widgetWithText(FilledButton, 'Next'));
    await _tap(tester, find.text('Refurbishment'));
    await _fillPlace(tester);
    await _tap(tester, find.widgetWithText(FilledButton, 'Publish listing'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('The device'), findsOneWidget);
    expect(find.text('That name is not allowed'), findsOneWidget);
    expect(find.text('Please fix the highlighted fields.'), findsOneWidget);
  });

  testWidgets('Back keeps what was typed', (tester) async {
    await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]));
    await _goToDeviceStep(tester);
    await tester.enterText(
        find.widgetWithText(TextFormField, 'Device name'), 'Kept name');
    await _fillRest(tester);
    await _tap(tester, find.text('Phones'));
    await _tap(tester, find.text('Fully working'));
    await _tap(tester, find.widgetWithText(FilledButton, 'Next'));

    await _tap(tester, find.widgetWithText(OutlinedButton, 'Back'));

    expect(find.text('Kept name'), findsOneWidget);
  });

  group('the area and city from a spot', () {
    Future<void> toLastStep(WidgetTester tester) async {
      await _goToDeviceStep(tester);
      await tester.enterText(
          find.widgetWithText(TextFormField, 'Device name'), 'Old router');
    await _fillRest(tester);
      await _tap(tester, find.text('Laptops'));
      await _tap(tester, find.text('Not working'));
      await _tap(tester, find.widgetWithText(FilledButton, 'Next'));
    }

    Finder field(String label) => find.widgetWithText(TextFormField, label);
    String text(WidgetTester tester, String label) =>
        tester.widget<TextFormField>(field(label)).controller!.text;
    Future<void> useMyLocation(WidgetTester tester) async {
      await tester.ensureVisible(find.text('Use my location'));
      await _tap(tester, find.text('Use my location'));
      await tester.pump(const Duration(milliseconds: 200));
    }

    testWidgets('fills in the empty area and city from the position',
        (tester) async {
      final geo = FakeGeoRepository();
      await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]),
          phone: FakeLocationService.at(const GeoPoint(12.9716, 77.5946)),
          geo: geo);
      await toLastStep(tester);
      await useMyLocation(tester);
      expect(geo.asked.single, (12.9716, 77.5946));
      expect(text(tester, 'Area or neighbourhood'), 'Indiranagar');
      expect(text(tester, 'City'), 'Bengaluru');
    });

    testWidgets('replaces what was typed when the person asks for their location', (tester) async {
      await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]),
          phone: FakeLocationService.at(const GeoPoint(12.9716, 77.5946)));
      await toLastStep(tester);
      await tester.enterText(
          field('Area or neighbourhood'), 'My own area');
      await useMyLocation(tester);
      expect(text(tester, 'Area or neighbourhood'), 'Indiranagar');
      expect(text(tester, 'City'), 'Bengaluru');
    });

    testWidgets(
        'carries on quietly when the address service cannot be reached, or knows nothing',
        (tester) async {
      final geo = FakeGeoRepository()
        ..error = const ApiException('Address search is unavailable',
            failure: ApiFailure.server, statusCode: 503);
      await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]),
          phone: FakeLocationService.at(const GeoPoint(12.9716, 77.5946)),
          geo: geo);
      await toLastStep(tester);
      await useMyLocation(tester);
      expect(text(tester, 'Area or neighbourhood'), isEmpty);
      expect(text(tester, 'City'), isEmpty);
      expect(tester.takeException(), isNull);
      expect(find.text('Address search is unavailable'),
          findsNothing); // optional help says nothing when it fails
    });

    testWidgets(
        'finds a typed address, keeps its spot and fills in the area and city',
        (tester) async {
      final geo = FakeGeoRepository();
      await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]), geo: geo);
      await toLastStep(tester);
      await tester.ensureVisible(find.text('Search an address'));
      await tester.enterText(
          find.widgetWithText(TextField, 'Search an address'),
          'Indiranagar Bengaluru');
      await _tap(tester, find.byTooltip('Search'));
      await tester.pump(const Duration(milliseconds: 100));
      expect(geo.searched.single, 'Indiranagar Bengaluru');
      await _tap(
          tester, find.text('Indiranagar, Bengaluru, Karnataka, India').last);
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.textContaining('Location saved (12.97160, 77.64123)'),
          findsOneWidget);
      expect(geo.asked.single, (12.9716, 77.64123));
      expect(text(tester, 'City'), 'Bengaluru');
    });

    testWidgets(
        'asks for a few more letters, says when nothing matches and when the service is out of reach',
        (tester) async {
      final geo = FakeGeoRepository()..found = const [];
      await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]), geo: geo);
      await toLastStep(tester);
      await tester.ensureVisible(find.text('Search an address'));
      await tester.enterText(
          find.widgetWithText(TextField, 'Search an address'), 'ab');
      await _tap(tester, find.byTooltip('Search'));
      expect(find.text('Type at least three letters of the address.'),
          findsOneWidget);
      expect(geo.searched, isEmpty);
      await tester.enterText(
          find.widgetWithText(TextField, 'Search an address'),
          'nowhere at all');
      await _tap(tester, find.byTooltip('Search'));
      await tester.pump(const Duration(milliseconds: 100));
      expect(find.textContaining('No places found'), findsOneWidget);
      geo.error = const ApiException(
          'Address search is unavailable. Please enter the area and city yourself.',
          failure: ApiFailure.server,
          statusCode: 503);
      await _tap(tester, find.byTooltip('Search'));
      await tester.pump(const Duration(milliseconds: 100));
      expect(
          find.textContaining('Address search is unavailable'), findsOneWidget);
      expect(find.textContaining('pick a spot on the map'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('leaves the fields alone for a spot nothing is known about',
        (tester) async {
      await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]),
          phone: FakeLocationService.at(const GeoPoint(0.001, 0.001)),
          geo: FakeGeoRepository(place: null));
      await toLastStep(tester);
      await useMyLocation(tester);
      expect(text(tester, 'Area or neighbourhood'), isEmpty);
    });
  });
}
