import 'dart:convert';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/widgets/app_chip.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/ai_result.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/models/user.dart';
import 'package:ewaste_opportunity/providers/ai_providers.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
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
import '../widgets/ai_cards_test.dart' show FakeAiRepository, resultJson;

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

/// A signed-in person whose profile has a phone number.
class _SignedInWithPhone extends AuthController {
  _SignedInWithPhone(this.phone);

  final String phone;

  @override
  AuthState build() {
    final user = sampleMe().user;
    return AuthState(
      status: AuthStatus.authenticated,
      me: Me(user: AppUser(id: user.id, name: user.name, email: user.email, role: user.role, status: user.status, emailVerified: user.emailVerified, phone: phone)),
    );
  }
}

Future<void> _pump(
    WidgetTester tester, FakeDeviceRepository repo, FakePhotoPicker picker,
    {FakeLocationService? phone,
    FakeGeoRepository? geo,
    FakeAiRepository? ai,
    String? profilePhone}) async {
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
        aiRepositoryProvider.overrideWithValue(ai ?? FakeAiRepository()),
        if (profilePhone != null) authControllerProvider.overrideWith(() => _SignedInWithPhone(profilePhone)),
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
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pump(const Duration(milliseconds: 100));
}

/// Answers the four parts a new listing needs, with whichever of them the chosen category has (battery, screen, ports and buttons, water damage).
Future<void> _answerRequiredParts(WidgetTester tester) async {
  for (final label in ['Holds charge well', 'No damage', 'All work', 'None']) {
    final f = find.text(label);
    if (f.evaluate().isNotEmpty) await _tap(tester, f.first);
  }
}

FakeDeviceRepository _repo() => FakeDeviceRepository(categoryList: const [
      Category(id: 'c1', name: 'Phones', slug: 'phones'),
      Category(id: 'c2', name: 'Laptops', slug: 'laptops'),
    ]);

Future<void> _goToDeviceStep(WidgetTester tester) async {
  // The whole form is on one page. A photo is needed to publish; add one when the test has not.
  if (find.text('0 of 6 photos').evaluate().isNotEmpty) {
    await _tap(tester, find.text('Gallery'));
  }
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

  testWidgets('photos: publishing needs a photo, and says so', (tester) async {
    final repo = _repo();
    await _pump(tester, repo, FakePhotoPicker(gallery: [_good]));
    await _tap(tester, find.widgetWithText(FilledButton, 'Publish listing'));
    expect(find.text('Add at least one photo of the device.'), findsOneWidget);
    expect(repo.created, isEmpty);

    await _tap(tester, find.text('Gallery'));
    expect(find.text('Add at least one photo of the device.'), findsNothing);
  });

  testWidgets('everything is on one page: photos, the device and what you want, with no Next button', (tester) async {
    await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]));
    for (final title in ['Add photos', 'The basics', 'Age', 'Condition', 'Price', 'Handover', 'Where is it?', 'Protect your data']) {
      expect(find.text(title, skipOffstage: false), findsWidgets, reason: title);
    }
    expect(find.widgetWithText(FilledButton, 'Next'), findsNothing);
    expect(find.widgetWithText(OutlinedButton, 'Back'), findsNothing);
    expect(find.text('Publish listing'), findsOneWidget);
  });

  testWidgets('a small AI help button sits under the photos and opens the AI card only when pressed', (tester) async {
    await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]));
    expect(find.text('Let AI help fill this in'), findsNothing);
    final photosBottom = tester.getBottomLeft(find.text('Gallery')).dy;
    final aiTop = tester.getTopLeft(find.widgetWithText(OutlinedButton, 'AI help')).dy;
    final basicsTop = tester.getTopLeft(find.text('The basics')).dy;
    expect(aiTop, greaterThan(photosBottom)); // under the photo buttons
    expect(aiTop, lessThan(basicsTop)); // above the details

    await _tap(tester, find.text('AI help'));
    expect(find.text('Let AI help fill this in'), findsOneWidget);
    expect(find.text('Hide AI help'), findsOneWidget);
    await _tap(tester, find.text('Hide AI help'));
    expect(find.text('Let AI help fill this in'), findsNothing);
  });

  testWidgets('the device step has no description box and no suggestions', (tester) async {
    await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]));
    await _goToDeviceStep(tester);
    expect(find.widgetWithText(TextFormField, 'Description'), findsNothing);
    expect(find.text('Not sure what to write? Tap to add:'), findsNothing);
  });

  group('the condition of each part', () {
    FakeDeviceRepository partsRepo() => FakeDeviceRepository(categoryList: const [
          Category(id: 'c1', name: 'Smartphone', slug: 'smartphone'),
          Category(id: 'c2', name: 'Keyboard', slug: 'keyboard'),
        ]);
    Future<void> toDeviceStep(WidgetTester tester, FakeDeviceRepository repo) async {
      await _pump(tester, repo, FakePhotoPicker(gallery: [_good]));
      await _goToDeviceStep(tester);
      await tester.pump(const Duration(milliseconds: 300)); // the categories load
    }

    testWidgets('asks for battery, screen, ports and buttons and water damage, and folds the rest behind Show more', (tester) async {
      await toDeviceStep(tester, partsRepo());
      expect(find.text('Battery *'), findsNothing); // no category yet
      await _tap(tester, find.text('Smartphone'));
      for (final part in ['Battery *', 'Screen *', 'Ports and buttons *', 'Water damage *']) {
        expect(find.text(part), findsOneWidget);
      }
      expect(find.text('Camera'), findsNothing);
      expect(find.text('Does it turn on?'), findsNothing);

      await _tap(tester, find.text('Show more (5)'));
      for (final part in ['Does it turn on?', 'Body and casing', 'Charging', 'Speaker and microphone', 'Camera']) {
        expect(find.text(part), findsOneWidget);
      }
      await _tap(tester, find.text('Show fewer details'));
      expect(find.text('Camera'), findsNothing);
    });

    testWidgets('shows only the parts that fit the category', (tester) async {
      await toDeviceStep(tester, partsRepo());
      await _tap(tester, find.text('Keyboard'));
      expect(find.text('Ports and buttons *'), findsOneWidget);
      expect(find.text('Water damage *'), findsOneWidget);
      expect(find.text('Battery *'), findsNothing);
      expect(find.text('Screen *'), findsNothing);
      expect(find.text('Show more (1)'), findsOneWidget); // just the body
    });

    testWidgets('will not go on until the four are answered, and says which are missing', (tester) async {
      await toDeviceStep(tester, partsRepo());
      await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Old phone');
      await _fillRest(tester);
      await _tap(tester, find.text('Smartphone'));
      await _tap(tester, find.text('Minor damage'));
      await _tap(tester, find.text('Drains quickly'));
      await _tap(tester, find.widgetWithText(FilledButton, 'Publish listing'));

      expect(find.text('Choose the screen condition'), findsOneWidget);
      expect(find.text('Choose the ports and buttons condition'), findsOneWidget);
      expect(find.text('Choose the water damage condition'), findsOneWidget);
      expect(find.text('Choose the battery condition'), findsNothing);

      await _tap(tester, find.text('Light scratches'));
      expect(find.text('Choose the screen condition'), findsNothing); // the message goes once it is answered
    });

    testWidgets('tapping the chosen answer again takes it back', (tester) async {
      await toDeviceStep(tester, partsRepo());
      await _tap(tester, find.text('Smartphone'));
      await _tap(tester, find.text('Drains quickly'));
      expect(find.textContaining('Based on your answers we suggest: Minor damage'), findsOneWidget);
      await _tap(tester, find.text('Drains quickly'));
      expect(find.textContaining('we suggest'), findsNothing);
    });

    testWidgets('suggests an overall condition and applies it only when asked', (tester) async {
      await toDeviceStep(tester, partsRepo());
      await _tap(tester, find.text('Smartphone'));
      expect(find.textContaining('we suggest'), findsNothing);

      await _tap(tester, find.text('Cracked'));
      expect(find.textContaining('Based on your answers we suggest: Major damage'), findsOneWidget);
      expect(tester.widgetList<AppChip>(find.widgetWithText(AppChip, 'Major damage')).single.selected, isFalse); // not applied by itself

      await _tap(tester, find.text('Use this'));
      expect(tester.widgetList<AppChip>(find.widgetWithText(AppChip, 'Major damage')).single.selected, isTrue);
      expect(find.textContaining('we suggest'), findsNothing);
    });

    testWidgets('sends the answers that were given, including a part from Show more', (tester) async {
      final repo = partsRepo();
      await toDeviceStep(tester, repo);
      await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Old phone');
      await _fillRest(tester);
      await _tap(tester, find.text('Smartphone'));
      await _tap(tester, find.text('Drains quickly'));
      await _tap(tester, find.text('Light scratches'));
      await _tap(tester, find.text('All work'));
      await _tap(tester, find.text('None'));
      await _tap(tester, find.text('Show more (5)'));
      await _tap(tester, find.text('Faulty').last); // the camera
      await _tap(tester, find.text('Minor damage'));
      await _tap(tester, find.text('Repair'));
      await _fillPlace(tester);
      await _tap(tester, find.text('Save as draft'));
      await tester.pump(const Duration(milliseconds: 300));

      expect(repo.created.single.conditionDetails, {'battery': 'drains_fast', 'screen': 'scratched', 'ports': 'all_work', 'water': 'none', 'camera': 'faulty'});
      expect(jsonDecode(repo.created.single.toFields()['conditionDetails']!), {'battery': 'drains_fast', 'screen': 'scratched', 'ports': 'all_work', 'water': 'none', 'camera': 'faulty'});
    });

    testWidgets('sends only the answers for the chosen category', (tester) async {
      final repo = partsRepo();
      await toDeviceStep(tester, repo);
      await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Old keyboard');
      await _fillRest(tester);
      await _tap(tester, find.text('Smartphone'));
      await _tap(tester, find.text('Drains quickly'));
      await _tap(tester, find.text('Cracked')); // a screen answer...
      await _tap(tester, find.text('Keyboard')); // ...that does not belong to a keyboard
      await _tap(tester, find.text('All work'));
      await _tap(tester, find.text('None'));
      await _tap(tester, find.text('Minor damage'));
      await _tap(tester, find.text('Repair'));
      await _fillPlace(tester);
      await _tap(tester, find.text('Save as draft'));
      await tester.pump(const Duration(milliseconds: 300));

      expect(repo.created.single.conditionDetails, {'ports': 'all_work', 'water': 'none'}); // no battery or screen for a keyboard
    });
  });

  group('the price and the phone number', () {
    Future<void> toPriceStep(WidgetTester tester, FakeDeviceRepository repo, {FakeAiRepository? ai, String? phone}) async {
      await _pump(tester, repo, FakePhotoPicker(gallery: [_good]), ai: ai, profilePhone: phone);
      await _goToDeviceStep(tester);
      await tester.pump(const Duration(milliseconds: 300));
      await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Galaxy A12');
      await _fillRest(tester);
      await _tap(tester, find.text('Phones'));
      await _tap(tester, find.text('Minor damage'));
      await _answerRequiredParts(tester);
      await tester.pump(const Duration(milliseconds: 300));
    }

    testWidgets('shows the price the AI expects and fills it in on request', (tester) async {
      final ai = FakeAiRepository(result: AiResult.fromJson({...resultJson(), 'estimate': {'resale': {'min': 8000, 'max': 12000}}}));
      await toPriceStep(tester, _repo(), ai: ai);
      expect(ai.analyzed, isEmpty); // nothing is sent until the person asks
      await _tap(tester, find.text('Ask the AI'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.textContaining('AI expects about'), findsOneWidget);
      expect(find.textContaining('8,000'), findsWidgets);
      expect(ai.analyzed.single.photos, 1);
      expect(ai.analyzed.single.text, contains('Galaxy A12'));
      await _tap(tester, find.text('Use ₹10,000'));
      expect(tester.widget<TextFormField>(find.widgetWithText(TextFormField, 'Asking price in ₹ (optional, 0 for free)')).controller!.text, '10000');
    });

    testWidgets('falls back to the plain hint when the AI has no price, and can be asked again', (tester) async {
      final ai = FakeAiRepository(result: AiResult.fromJson({...resultJson(), 'estimate': {'resale': null, 'repair': null}}));
      await toPriceStep(tester, _repo(), ai: ai);
      await _tap(tester, find.text('Ask the AI'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(find.textContaining('could not suggest a price'), findsOneWidget);
      expect(find.text('Ask the AI'), findsOneWidget);
    });

    testWidgets('fills the phone number from the profile', (tester) async {
      await toPriceStep(tester, _repo(), ai: FakeAiRepository(), phone: '+91 98765-43210');
      expect(tester.widget<TextFormField>(find.widgetWithText(TextFormField, 'Your phone number')).controller!.text, '9876543210');
    });

    testWidgets('leaves it empty when the profile has none or not a mobile number', (tester) async {
      await toPriceStep(tester, _repo(), ai: FakeAiRepository(), phone: '12345');
      expect(tester.widget<TextFormField>(find.widgetWithText(TextFormField, 'Your phone number')).controller!.text, isEmpty);
    });
  });

  testWidgets('the last step will not go on until all three data-protection boxes are ticked', (tester) async {
    final repo = _repo();
    await _pump(tester, repo, FakePhotoPicker(gallery: [_good]));
    await _goToDeviceStep(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Galaxy A12');
    await _fillRest(tester);
    await _tap(tester, find.text('Phones'));
    await _tap(tester, find.text('Minor damage'));
    await _answerRequiredParts(tester);
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
    await _answerRequiredParts(tester);
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
      'publishing needs a name, a category, a condition and the rest, and says what is missing',
      (tester) async {
    await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]));
    await _goToDeviceStep(tester);
    await _tap(tester, find.widgetWithText(FilledButton, 'Publish listing'));


    expect(find.textContaining('Give the device a name'), findsOneWidget);
    expect(find.text('Choose a category'), findsOneWidget);
    expect(find.text('Choose the condition'), findsOneWidget);
    expect(find.textContaining('Enter the brand'), findsOneWidget);
    expect(find.textContaining('Enter the model'), findsOneWidget);
    expect(find.text('Enter the year this model came out'), findsOneWidget);
    expect(find.text('Enter the year it was bought'), findsOneWidget);
    expect(find.text('Choose what you want to do with it'), findsOneWidget);
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
    await _answerRequiredParts(tester);

    // A service is needed too.
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
    await _answerRequiredParts(tester);
    await _tap(tester, find.text('Recycling'));
    await _fillPlace(tester);
    await _tap(tester, find.text('Save as draft'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(repo.created.single.draft, isTrue);
    expect(repo.created.single.toFields()['status'], 'draft');
  });

  testWidgets('a server error on a field shows on that field',
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
    await _answerRequiredParts(tester);
    await _tap(tester, find.text('Refurbishment'));
    await _fillPlace(tester);
    await _tap(tester, find.widgetWithText(FilledButton, 'Publish listing'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('That name is not allowed'), findsOneWidget);
    expect(find.text('Please fix the highlighted fields.'), findsOneWidget);
  });

  testWidgets('what was typed stays while scrolling through the page', (tester) async {
    await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]));
    await _goToDeviceStep(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Kept name');
    await _fillRest(tester);
    await _tap(tester, find.text('Phones'));
    await _answerRequiredParts(tester);
    await _tap(tester, find.widgetWithText(FilledButton, 'Publish listing')); // scrolls to the first thing still missing
    await tester.pump(const Duration(milliseconds: 500));
    await tester.ensureVisible(find.widgetWithText(TextFormField, 'Device name'));
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
      await _answerRequiredParts(tester);
    }

    Finder field(String label) => find.widgetWithText(TextFormField, label);
    String text(WidgetTester tester, String label) =>
        tester.widget<TextFormField>(field(label)).controller!.text;
    Future<void> useMyLocation(WidgetTester tester) async {
      await tester.ensureVisible(find.text('Detect my current location'));
      await _tap(tester, find.text('Detect my current location'));
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
