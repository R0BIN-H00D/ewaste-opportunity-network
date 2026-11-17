import 'dart:convert';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/providers/ai_providers.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/listings_controller.dart';
import 'package:ewaste_opportunity/providers/photo_providers.dart';
import 'package:ewaste_opportunity/routes/route_paths.dart';
import 'package:ewaste_opportunity/screens/devices/new_listing_screen.dart';
import 'package:ewaste_opportunity/services/photo_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import 'package:ewaste_opportunity/widgets/app_chip.dart';
import '../fakes.dart';
import '../helpers.dart';

const _good = PickedPhoto(path: '/none/front.jpg', name: 'front.jpg', mime: 'image/jpeg', bytes: 2000);
const _gif = PickedPhoto(path: '/none/fun.gif', name: 'fun.gif', mime: 'image/gif', bytes: 2000);
const _huge = PickedPhoto(path: '/none/big.jpg', name: 'big.jpg', mime: 'image/jpeg', bytes: 6 * 1024 * 1024);

Future<void> _pump(WidgetTester tester, FakeDeviceRepository repo, FakePhotoPicker picker, {FakeAiRepository? ai}) async {
  tester.view.physicalSize = const Size(900, 2600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: Routes.newListing,
    routes: [
      GoRoute(path: Routes.newListing, builder: (_, __) => const NewListingScreen()),
      GoRoute(path: Routes.listingPattern, builder: (_, state) => Scaffold(body: Text('Opened ${state.pathParameters['id']}'))),
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
        aiRepositoryProvider.overrideWithValue(ai ?? FakeAiRepository()),
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

Future<void> _goToDeviceStep(WidgetTester tester) => _tap(tester, find.widgetWithText(FilledButton, 'Next'));

void main() {
  testWidgets('photos: the gallery adds good photos and explains why others were skipped', (tester) async {
    final picker = FakePhotoPicker(gallery: [_good, _gif, _huge]);
    await _pump(tester, _repo(), picker);

    expect(find.text('0 of 6 photos'), findsOneWidget);
    await _tap(tester, find.text('Gallery'));

    expect(picker.galleryCalls, 1);
    expect(find.text('1 of 6 photos'), findsOneWidget);
    expect(find.textContaining('fun.gif'), findsOneWidget);
    expect(find.textContaining('big.jpg'), findsOneWidget);
  });

  testWidgets('photos: the camera adds one, and a photo can be removed', (tester) async {
    final picker = FakePhotoPicker(camera: _good);
    await _pump(tester, _repo(), picker);

    await _tap(tester, find.text('Take a photo'));
    expect(picker.cameraCalls, 1);
    expect(find.text('1 of 6 photos'), findsOneWidget);

    await _tap(tester, find.byTooltip('Remove photo 1'));
    expect(find.text('0 of 6 photos'), findsOneWidget);
  });

  testWidgets('photos: no more than six', (tester) async {
    final picker = FakePhotoPicker(gallery: List.filled(8, _good));
    await _pump(tester, _repo(), picker);

    await _tap(tester, find.text('Gallery'));

    expect(find.text('6 of 6 photos'), findsOneWidget);
    final button = tester.widget<OutlinedButton>(find.widgetWithText(OutlinedButton, 'Gallery'));
    expect(button.onPressed, isNull);
  });

  testWidgets('the device step will not move on without a name, a category and a condition', (tester) async {
    await _pump(tester, _repo(), FakePhotoPicker());
    await _goToDeviceStep(tester);
    expect(find.text('The device'), findsOneWidget);

    await _tap(tester, find.widgetWithText(FilledButton, 'Next'));

    expect(find.textContaining('Give the device a name'), findsOneWidget);
    expect(find.text('Choose a category'), findsOneWidget);
    expect(find.text('Choose the condition'), findsOneWidget);
    expect(find.text('What you want'), findsNothing);
  });

  testWidgets('a full walk-through publishes the listing with its photos and opens it', (tester) async {
    final repo = _repo();
    await _pump(tester, repo, FakePhotoPicker(gallery: [_good]));

    await _tap(tester, find.text('Gallery'));
    await _goToDeviceStep(tester);

    await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Galaxy A12');
    await _tap(tester, find.text('Phones'));
    await _tap(tester, find.text('Minor damage'));
    await _tap(tester, find.widgetWithText(FilledButton, 'Next'));
    expect(find.text('What you want'), findsOneWidget);

    // The last step needs a service.
    await _tap(tester, find.widgetWithText(FilledButton, 'Publish listing'));
    expect(find.text('Choose what you want to do with it'), findsOneWidget);
    expect(repo.created, isEmpty);

    await _tap(tester, find.text('Repair'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Asking price in ₹ (optional, 0 for free)'), '1,200');
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
    await _pump(tester, repo, FakePhotoPicker());

    await _goToDeviceStep(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Old router');
    await _tap(tester, find.text('Laptops'));
    await _tap(tester, find.text('Not working'));
    await _tap(tester, find.widgetWithText(FilledButton, 'Next'));
    await _tap(tester, find.text('Recycling'));
    await _tap(tester, find.text('Save as draft'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(repo.created.single.draft, isTrue);
    expect(repo.created.single.toFields()['status'], 'draft');
  });

  testWidgets('a server error on a field takes the person back to that step', (tester) async {
    final repo = _repo()..createError = const ApiException('Validation failed', failure: ApiFailure.validation, statusCode: 422, fieldErrors: {'name': 'That name is not allowed'});
    await _pump(tester, repo, FakePhotoPicker());

    await _goToDeviceStep(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Bad name');
    await _tap(tester, find.text('Phones'));
    await _tap(tester, find.text('Fully working'));
    await _tap(tester, find.widgetWithText(FilledButton, 'Next'));
    await _tap(tester, find.text('Reuse'));
    await _tap(tester, find.widgetWithText(FilledButton, 'Publish listing'));
    await tester.pump(const Duration(milliseconds: 300));

    expect(find.text('The device'), findsOneWidget);
    expect(find.text('That name is not allowed'), findsOneWidget);
    expect(find.text('Please fix the highlighted fields.'), findsOneWidget);
  });

  testWidgets('Back keeps what was typed', (tester) async {
    await _pump(tester, _repo(), FakePhotoPicker());
    await _goToDeviceStep(tester);
    await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Kept name');
    await _tap(tester, find.text('Phones'));
    await _tap(tester, find.text('Fully working'));
    await _tap(tester, find.widgetWithText(FilledButton, 'Next'));

    await _tap(tester, find.widgetWithText(OutlinedButton, 'Back'));

    expect(find.text('Kept name'), findsOneWidget);
  });

  group('the suggestion', () {
    Future<void> ask(WidgetTester tester) async {
      await tester.ensureVisible(find.text('Suggest what this is'));
      await _tap(tester, find.text('Suggest what this is'));
      await tester.pump(const Duration(milliseconds: 100));
    }

    testWidgets('is only a suggestion: nothing changes until the person taps "Use this"', (tester) async {
      final ai = FakeAiRepository();
      await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]), ai: ai);
      await _tap(tester, find.text('Gallery'));
      await _goToDeviceStep(tester);
      await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Dell laptop');
      await ask(tester);

      expect(ai.asked.single, (title: 'Dell laptop', description: '', photo: true));
      expect(find.text('Category: Laptops'), findsOneWidget);
      expect(find.text('Brand: Dell'), findsOneWidget);
      expect(find.text('Damage you mentioned: Scratches'), findsOneWidget);
      expect(find.textContaining('A photo cannot show damage inside'), findsOneWidget);
      expect(find.text('From your words · Not very sure'), findsOneWidget);
      expect(tester.widget<TextFormField>(find.widgetWithText(TextFormField, 'Brand (optional)')).controller!.text, '');
      final laptops = tester.widget<AppChip>(find.widgetWithText(AppChip, 'Laptops'));
      expect(laptops.selected, isFalse);
    });

    testWidgets('"Use this" picks the category and fills brand and notes without overwriting what was typed', (tester) async {
      final repo = _repo();
      await _pump(tester, repo, FakePhotoPicker(), ai: FakeAiRepository());
      await _goToDeviceStep(tester);
      await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Dell laptop');
      await tester.enterText(find.widgetWithText(TextFormField, 'Brand (optional)'), 'My own brand');
      await ask(tester);
      await _tap(tester, find.text('Use this'));

      expect(tester.widget<AppChip>(find.widgetWithText(AppChip, 'Laptops')).selected, isTrue);
      expect(tester.widget<TextFormField>(find.widgetWithText(TextFormField, 'Brand (optional)')).controller!.text, 'My own brand');
      expect(tester.widget<TextFormField>(find.widgetWithText(TextFormField, 'What is wrong, or anything to know (optional)')).controller!.text, 'Looks like: Scratches.');
      expect(find.text('Added to the form. You can still change it.'), findsOneWidget);

      await _tap(tester, find.text('Minor damage'));
      await _tap(tester, find.widgetWithText(FilledButton, 'Next'));
      await _tap(tester, find.text('Repair'));
      await _tap(tester, find.text('Save as draft'));
      await tester.pump(const Duration(milliseconds: 300));
      final saved = jsonDecode(repo.created.single.toFields()['aiSuggestion']!) as Map<String, dynamic>;
      expect(saved, {'source': 'rules', 'category': 'laptops', 'type': 'Laptop', 'brand': 'Dell', 'visibleDamage': ['Scratches'], 'possibleRepairs': [], 'confidence': 0.6});
    });

    testWidgets('a listing made without using it sends no suggestion', (tester) async {
      final repo = _repo();
      await _pump(tester, repo, FakePhotoPicker(), ai: FakeAiRepository());
      await _goToDeviceStep(tester);
      await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Old router');
      await ask(tester); // asked, but never accepted
      await _tap(tester, find.text('Laptops'));
      await _tap(tester, find.text('Not working'));
      await _tap(tester, find.widgetWithText(FilledButton, 'Next'));
      await _tap(tester, find.text('Recycling'));
      await _tap(tester, find.text('Save as draft'));
      await tester.pump(const Duration(milliseconds: 300));
      expect(repo.created.single.toFields().containsKey('aiSuggestion'), isFalse);
    });

    testWidgets('asks for a photo or a name first, rather than sending nothing', (tester) async {
      final ai = FakeAiRepository();
      await _pump(tester, _repo(), FakePhotoPicker(), ai: ai);
      await _goToDeviceStep(tester);
      await ask(tester);
      expect(find.text('Add a photo or type the device name first.'), findsOneWidget);
      expect(ai.asked, isEmpty);
    });

    testWidgets('says plainly when it could not tell, and offers nothing to use', (tester) async {
      await _pump(tester, _repo(), FakePhotoPicker(), ai: FakeAiRepository(answer: aiJson(category: null, brand: null, damage: const [], confidence: 0)));
      await _goToDeviceStep(tester);
      await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Thing');
      await ask(tester);
      expect(find.text('We could not tell what this is. Please choose the category yourself.'), findsOneWidget);
      expect(find.text('Use this'), findsNothing);
    });

    testWidgets('says why it failed and lets the person carry on by hand', (tester) async {
      final ai = FakeAiRepository()..error = const ApiException('Too many suggestions just now.', failure: ApiFailure.server, statusCode: 429);
      await _pump(tester, _repo(), FakePhotoPicker(), ai: ai);
      await _goToDeviceStep(tester);
      await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Dell laptop');
      await ask(tester);
      expect(find.text('Too many suggestions just now.'), findsOneWidget);
      await _tap(tester, find.text('Laptops'));
      expect(tester.widget<AppChip>(find.widgetWithText(AppChip, 'Laptops')).selected, isTrue);
    });

    testWidgets('says when it read the photo', (tester) async {
      await _pump(tester, _repo(), FakePhotoPicker(gallery: [_good]), ai: FakeAiRepository(answer: aiJson(source: 'gemini', usedPhoto: true, confidence: 0.9, reason: null, damage: const ['Cracked screen'])));
      await _tap(tester, find.text('Gallery'));
      await _goToDeviceStep(tester);
      await ask(tester);
      expect(find.text('From your photo · Fairly sure'), findsOneWidget);
      expect(find.text('Damage that looks visible: Cracked screen'), findsOneWidget);
    });

    testWidgets('fits at the largest text size', (tester) async {
      await _pump(tester, _repo(), FakePhotoPicker(), ai: FakeAiRepository());
      tester.platformDispatcher.textScaleFactorTestValue = 2;
      addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
      await _goToDeviceStep(tester);
      await tester.enterText(find.widgetWithText(TextFormField, 'Device name'), 'Dell laptop');
      await ask(tester);
      expect(tester.takeException(), isNull);
    });
  });}
