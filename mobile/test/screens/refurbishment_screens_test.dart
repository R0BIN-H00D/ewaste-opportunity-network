import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/listings_controller.dart';
import 'package:ewaste_opportunity/providers/marketplace_providers.dart';
import 'package:ewaste_opportunity/providers/photo_providers.dart';
import 'package:ewaste_opportunity/providers/refurbishment_providers.dart';
import 'package:ewaste_opportunity/screens/refurbishment/my_products_screen.dart';
import 'package:ewaste_opportunity/screens/refurbishment/product_form_screen.dart';
import 'package:ewaste_opportunity/screens/refurbishment/refurb_job_details_screen.dart';
import 'package:ewaste_opportunity/screens/refurbishment/refurb_jobs_screen.dart';
import 'package:ewaste_opportunity/screens/refurbishment/refurb_opportunities_screen.dart';
import 'package:ewaste_opportunity/services/photo_picker.dart';
import 'package:ewaste_opportunity/widgets/app_chip.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';

const _good = PickedPhoto(path: '/none/front.jpg', name: 'front.jpg', mime: 'image/jpeg', bytes: 2000);

Future<void> _pump(
  WidgetTester tester,
  Widget screen, {
  FakeRefurbishmentRepository? refurb,
  FakeMarketplaceRepository? shop,
  FakePhotoPicker? picker,
}) async {
  tester.view.physicalSize = const Size(900, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, __) => Scaffold(body: screen)),
      GoRoute(path: '/refurbish/jobs/:id', builder: (_, s) => Scaffold(body: Text('job page ${s.pathParameters['id']}'))),
      GoRoute(path: '/my-products/new', builder: (_, s) => Scaffold(body: Text('new product ${s.uri.queryParameters['job']}'))),
      GoRoute(path: '/my-products/:id/edit', builder: (_, s) => Scaffold(body: Text('edit product ${s.pathParameters['id']}'))),
      GoRoute(path: '/shop/:id', builder: (_, s) => Scaffold(body: Text('product page ${s.pathParameters['id']}'))),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
        refurbishmentRepositoryProvider.overrideWithValue(refurb ?? FakeRefurbishmentRepository()),
        marketplaceRepositoryProvider.overrideWithValue(shop ?? FakeMarketplaceRepository()),
        deviceRepositoryProvider.overrideWithValue(FakeDeviceRepository()),
        photoPickerProvider.overrideWithValue(picker ?? FakePhotoPicker()),
        categoriesProvider.overrideWith((ref) async => const [Category(id: 'c1', name: 'Phones', slug: 'phones'), Category(id: 'c2', name: 'Laptops', slug: 'laptops')]),
      ],
      child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
    ),
  );
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 50));
}

/// Taps and lets a dialog, sheet or answer finish (the pulsing skeletons keep `pumpAndSettle` from ever returning).
Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Finder _inDialog(String text) => find.descendant(of: find.byType(AlertDialog), matching: find.text(text));

void main() {
  group('devices to refurbish', () {
    testWidgets('lists each device with its condition and area', (tester) async {
      final repo = FakeRefurbishmentRepository(opportunityPages: {1: [sampleRefurbOpportunity(), sampleRefurbOpportunity(id: 'l2', hasOffered: true)]});
      await _pump(tester, const RefurbOpportunitiesScreen(), refurb: repo);

      expect(find.text('Old Dell laptop'), findsNWidgets(2));
      expect(find.text('Offer sent'), findsOneWidget);
      expect(find.text('Indiranagar, Bengaluru'), findsNWidgets(2));
    });

    testWidgets('a device chip filters and tapping it again clears it', (tester) async {
      final repo = FakeRefurbishmentRepository(opportunityPages: {1: [sampleRefurbOpportunity()]});
      await _pump(tester, const RefurbOpportunitiesScreen(), refurb: repo);

      await _tap(tester, find.widgetWithText(AppChip, 'Laptops'));
      expect(repo.opportunityQueries.last.category, 'laptops');
      await _tap(tester, find.widgetWithText(AppChip, 'Laptops'));
      expect(repo.opportunityQueries.last.category, '');
    });

    testWidgets('offering sends the amount and message, then opens the job', (tester) async {
      final repo = FakeRefurbishmentRepository(opportunityPages: {1: [sampleRefurbOpportunity()]});
      await _pump(tester, const RefurbOpportunitiesScreen(), refurb: repo);

      await _tap(tester, find.text('Old Dell laptop'));
      expect(find.text('Offer to refurbish this device'), findsOneWidget);
      await tester.enterText(find.widgetWithText(TextFormField, 'Amount you will pay the owner, in rupees (optional)'), '500');
      await tester.enterText(find.widgetWithText(TextFormField, 'A message for the owner (optional)'), 'Within a week');
      await _tap(tester, find.text('Send offer'));

      expect(repo.calls, ['offer:l1:500.0:Within a week']);
      expect(find.text('job page j-new'), findsOneWidget);
    });

    testWidgets('a bad amount stops the offer', (tester) async {
      final repo = FakeRefurbishmentRepository(opportunityPages: {1: [sampleRefurbOpportunity()]});
      await _pump(tester, const RefurbOpportunitiesScreen(), refurb: repo);
      await _tap(tester, find.text('Old Dell laptop'));
      await tester.enterText(find.widgetWithText(TextFormField, 'Amount you will pay the owner, in rupees (optional)'), 'lots');
      await _tap(tester, find.text('Send offer'));
      expect(find.text('Enter an amount in rupees, for example 500'), findsOneWidget);
      expect(repo.calls, isEmpty);
    });

    testWidgets('a device that already has an offer says so instead of opening the form', (tester) async {
      await _pump(tester, const RefurbOpportunitiesScreen(), refurb: FakeRefurbishmentRepository(opportunityPages: {1: [sampleRefurbOpportunity(hasOffered: true)]}));
      await _tap(tester, find.text('Old Dell laptop'));
      expect(find.textContaining('already made an offer'), findsOneWidget);
      expect(find.text('Send offer'), findsNothing);
    });

    testWidgets('shows what the server refused', (tester) async {
      final repo = FakeRefurbishmentRepository(opportunityPages: {1: [sampleRefurbOpportunity()]});
      await _pump(tester, const RefurbOpportunitiesScreen(), refurb: repo);
      // The fake only throws once an action starts, so set the error after the list has loaded.
      repo.actionError = const ApiException('This device is no longer available', code: 'LISTING_UNAVAILABLE');
      await _tap(tester, find.text('Old Dell laptop'));
      await _tap(tester, find.text('Send offer'));
      expect(find.text('This device is no longer available'), findsOneWidget);
    });

    testWidgets('says so when there is nothing to show', (tester) async {
      await _pump(tester, const RefurbOpportunitiesScreen());
      expect(find.text('No devices to refurbish right now'), findsOneWidget);
    });
  });

  group('refurbishment jobs', () {
    testWidgets('lists jobs with their status and offer', (tester) async {
      final repo = FakeRefurbishmentRepository(pages: {
        1: [sampleRefurbJob(), sampleRefurbJob(id: 'j2', status: 'in_progress', actions: const [], amount: 0)],
      });
      await _pump(tester, const RefurbJobsScreen(), refurb: repo);

      expect(find.text('Old Dell laptop'), findsNWidgets(2));
      expect(find.widgetWithText(StatusBadge, 'Offer sent'), findsOneWidget);
      expect(find.text('Being refurbished'), findsWidgets);
      expect(find.text('Free collection'), findsOneWidget);
    });

    testWidgets('the side and status chips change what is asked for', (tester) async {
      final repo = FakeRefurbishmentRepository();
      await _pump(tester, const RefurbJobsScreen(), refurb: repo);
      expect(find.text('No jobs yet'), findsOneWidget);

      await _tap(tester, find.widgetWithText(AppChip, 'My devices'));
      expect(repo.listCalls.last.as, 'owner');
      await _tap(tester, find.widgetWithText(AppChip, 'Ready to sell'));
      expect(repo.listCalls.last.status, 'ready_to_list');
      expect(find.text('Nothing here'), findsOneWidget);
    });

    testWidgets('tapping a job opens it', (tester) async {
      await _pump(tester, const RefurbJobsScreen(), refurb: FakeRefurbishmentRepository(pages: {1: [sampleRefurbJob(id: 'zz')]}));
      await _tap(tester, find.text('Old Dell laptop'));
      expect(find.text('job page zz'), findsOneWidget);
    });
  });

  group('a job, for the refurbisher', () {
    testWidgets('shows the offer and lets the refurbisher withdraw it', (tester) async {
      final repo = FakeRefurbishmentRepository()..result = sampleRefurbJob(status: 'cancelled', actions: const []);
      await _pump(tester, const RefurbJobDetailsScreen(id: 'j1'), refurb: repo);

      expect(find.text('Old Dell laptop'), findsOneWidget);
      expect(find.textContaining('Your offer is with the owner'), findsOneWidget);
      expect(find.text('I can fix it in a week'), findsOneWidget);
      await _tap(tester, find.text('Withdraw my offer'));
      await _tap(tester, _inDialog('Withdraw'));
      expect(repo.calls, ['withdraw']);
      expect(find.text('This job was cancelled.'), findsOneWidget);
    });

    testWidgets('confirming the collection needs no checklist', (tester) async {
      final repo = FakeRefurbishmentRepository(
        current: sampleRefurbJob(status: 'accepted', actions: const ['confirm_handover', 'cancel'], pickup: {'date': '2026-11-20T10:00:00.000Z', 'status': 'scheduled'}),
      );
      await _pump(tester, const RefurbJobDetailsScreen(id: 'j1'), refurb: repo);

      await _tap(tester, find.text('Confirm the handover'));
      expect(find.text('Did you collect it?'), findsOneWidget);
      await _tap(tester, _inDialog('Yes, I have it'));
      expect(repo.calls, ['confirm:false']);
    });

    testWidgets('moving on asks for a note and sends the next step', (tester) async {
      final repo = FakeRefurbishmentRepository(current: sampleRefurbJob(status: 'collected', actions: const ['advance', 'add_photos'], photoStages: const ['before'], nextStatus: 'assessment'));
      await _pump(tester, const RefurbJobDetailsScreen(id: 'j1'), refurb: repo);

      expect(find.text('Add photos'), findsOneWidget);
      await _tap(tester, find.text('Start the assessment'));
      await tester.enterText(find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextFormField)), 'Screen is fine');
      await _tap(tester, _inDialog('Continue'));
      expect(repo.calls, ['advance:assessment:Screen is fine']);
    });

    testWidgets('a finished job can be put on sale', (tester) async {
      final repo = FakeRefurbishmentRepository(current: sampleRefurbJob(status: 'ready_to_list', actions: const ['list_product', 'add_photos'], photoStages: const ['after']));
      await _pump(tester, const RefurbJobDetailsScreen(id: 'j1'), refurb: repo);

      await _tap(tester, find.text('Put it on sale'));
      expect(find.text('new product j1'), findsOneWidget);
    });

    testWidgets('the server\'s reason is shown when a step is refused', (tester) async {
      final repo = FakeRefurbishmentRepository(current: sampleRefurbJob(status: 'testing', actions: const ['advance'], nextStatus: 'ready_to_list'))
        ..actionError = const ApiException('Add at least one "before" photo', code: 'VALIDATION_ERROR', failure: ApiFailure.validation);
      await _pump(tester, const RefurbJobDetailsScreen(id: 'j1'), refurb: repo);

      await _tap(tester, find.text('Mark ready to sell'));
      await _tap(tester, _inDialog('Continue'));
      expect(find.text('Add at least one "before" photo'), findsOneWidget);
    });
  });

  group('a job, for the owner', () {
    testWidgets('accepting an offer asks first', (tester) async {
      final repo = FakeRefurbishmentRepository(current: sampleRefurbJob(role: 'owner', actions: const ['decide', 'cancel']))..result = sampleRefurbJob(role: 'owner', status: 'accepted', actions: const ['schedule_handover']);
      await _pump(tester, const RefurbJobDetailsScreen(id: 'j1'), refurb: repo);

      expect(find.textContaining('A refurbisher made an offer'), findsOneWidget);
      await _tap(tester, find.text('Accept this offer'));
      await _tap(tester, _inDialog('Accept'));
      expect(repo.calls, ['accept']);
      expect(find.text('Arrange the collection'), findsOneWidget);
    });

    testWidgets('handing the device over needs the data-protection checklist', (tester) async {
      final repo = FakeRefurbishmentRepository(
        current: sampleRefurbJob(role: 'owner', status: 'accepted', actions: const ['confirm_handover'], pickup: {'date': '2026-11-20T10:00:00.000Z', 'status': 'scheduled'}),
      );
      await _pump(tester, const RefurbJobDetailsScreen(id: 'j1'), refurb: repo);

      await _tap(tester, find.text('Confirm the handover'));
      expect(find.text('Before you hand it over'), findsOneWidget);
      await _tap(tester, find.text('I have done this'));
      await _tap(tester, find.widgetWithText(FilledButton, 'Confirm handover'));
      expect(repo.calls, ['confirm:true']);
    });

    testWidgets('declining sends the decision', (tester) async {
      final repo = FakeRefurbishmentRepository(current: sampleRefurbJob(role: 'owner', actions: const ['decide', 'cancel']));
      await _pump(tester, const RefurbJobDetailsScreen(id: 'j1'), refurb: repo);
      await _tap(tester, find.widgetWithText(OutlinedButton, 'Decline'));
      await _tap(tester, _inDialog('Decline'));
      expect(repo.calls, ['reject']);
    });
  });

  group('my products', () {
    testWidgets('lists products with their status and a way to add one', (tester) async {
      final shop = FakeMarketplaceRepository()
        ..minePages = {
          1: [sampleProduct(), sampleProduct(id: 'p2', status: 'hidden')],
        };
      await _pump(tester, const MyProductsScreen(), shop: shop);

      expect(find.text('Refurbished ThinkPad'), findsNWidgets(2));
      expect(find.text('On sale'), findsWidgets);
      expect(find.text('Hidden'), findsWidgets);
      expect(find.text('List a product'), findsOneWidget);
    });

    testWidgets('a status chip asks for that status; a product opens for editing', (tester) async {
      final shop = FakeMarketplaceRepository()..minePages = {1: [sampleProduct(id: 'p9')]};
      await _pump(tester, const MyProductsScreen(), shop: shop);

      await _tap(tester, find.widgetWithText(AppChip, 'Hidden'));
      expect(shop.mineCalls.last, 'hidden');
      await _tap(tester, find.widgetWithText(AppChip, 'All'));
      await _tap(tester, find.text('Refurbished ThinkPad'));
      expect(find.text('edit product p9'), findsOneWidget);
    });

    testWidgets('an empty list explains how to get started', (tester) async {
      await _pump(tester, const MyProductsScreen());
      expect(find.text('You have not listed a product yet'), findsOneWidget);
    });
  });

  group('the product form', () {
    testWidgets('an empty form says what is missing and sends nothing', (tester) async {
      final shop = FakeMarketplaceRepository();
      await _pump(tester, const ProductFormScreen(), shop: shop);

      await _tap(tester, find.text('Put it on sale'));
      expect(find.text('Give the product a clear title'), findsOneWidget);
      expect(find.text('Choose the type of device'), findsOneWidget);
      expect(find.text('Choose the condition you are selling it in'), findsOneWidget);
      expect(shop.calls, isEmpty);
    });

    testWidgets('a complete form with a photo lists the product and opens it', (tester) async {
      final shop = FakeMarketplaceRepository();
      await _pump(tester, const ProductFormScreen(), shop: shop, picker: FakePhotoPicker(gallery: [_good]));

      await tester.enterText(find.widgetWithText(TextFormField, 'Title'), 'Refurbished Dell laptop');
      await _tap(tester, find.widgetWithText(DropdownButtonFormField<String>, 'Type of device'));
      await _tap(tester, find.text('Laptops').last);
      await _tap(tester, find.widgetWithText(DropdownButtonFormField<String>, 'Condition (shown to buyers)'));
      await _tap(tester, find.text('Good').last);
      await tester.enterText(find.widgetWithText(TextFormField, 'What was repaired, replaced or tested?'), 'New battery fitted and every port tested');
      await tester.enterText(find.widgetWithText(TextFormField, 'Price in rupees'), '18999');
      await tester.enterText(find.widgetWithText(TextFormField, 'Specifications (optional, one per line, "RAM: 8 GB")'), 'RAM: 8 GB');
      await _tap(tester, find.text('Choose'));
      await _tap(tester, find.text('Put it on sale'));

      expect(shop.calls, ['create:Refurbished Dell laptop']);
      final sent = shop.inputs.single;
      expect(sent.category, 'laptops');
      expect(sent.condition, 'good');
      expect(sent.price, 18999);
      expect(sent.stock, 1);
      expect(sent.specs, {'RAM': '8 GB'});
      expect(sent.photos, hasLength(1));
      expect(find.text('product page p-new'), findsOneWidget);
    });

    testWidgets('a product without a photo is not sent', (tester) async {
      final shop = FakeMarketplaceRepository();
      await _pump(tester, const ProductFormScreen(), shop: shop);

      await tester.enterText(find.widgetWithText(TextFormField, 'Title'), 'Refurbished Dell laptop');
      await _tap(tester, find.widgetWithText(DropdownButtonFormField<String>, 'Type of device'));
      await _tap(tester, find.text('Laptops').last);
      await _tap(tester, find.widgetWithText(DropdownButtonFormField<String>, 'Condition (shown to buyers)'));
      await _tap(tester, find.text('Good').last);
      await tester.enterText(find.widgetWithText(TextFormField, 'What was repaired, replaced or tested?'), 'New battery fitted and every port tested');
      await tester.enterText(find.widgetWithText(TextFormField, 'Price in rupees'), '18999');
      await _tap(tester, find.text('Put it on sale'));

      expect(find.text('Add at least one photo of the product'), findsOneWidget);
      expect(shop.calls, isEmpty);
    });

    testWidgets('editing starts from the product and saves only through update', (tester) async {
      final shop = FakeMarketplaceRepository(product: sampleProduct(id: 'p1', isMine: true));
      await _pump(tester, const ProductFormScreen(productId: 'p1'), shop: shop);

      expect(find.text('Refurbished ThinkPad'), findsOneWidget);
      expect(find.text('Show in the shop'), findsOneWidget);
      await tester.enterText(find.widgetWithText(TextFormField, 'Price in rupees'), '22999');
      await _tap(tester, find.text('Save changes'));
      expect(shop.calls, ['update:p1']);
      expect(shop.inputs.single.price, 22999);
    });

    testWidgets('removing a product asks first', (tester) async {
      final shop = FakeMarketplaceRepository(product: sampleProduct(id: 'p1', isMine: true));
      await _pump(tester, const ProductFormScreen(productId: 'p1'), shop: shop);

      await _tap(tester, find.text('Remove product'));
      await _tap(tester, _inDialog('Remove'));
      expect(shop.calls, ['remove:p1']);
    });

    testWidgets('a product made from a job has no stock field', (tester) async {
      await _pump(tester, const ProductFormScreen(jobId: 'j1'), refurb: FakeRefurbishmentRepository(current: sampleRefurbJob(status: 'ready_to_list', actions: const ['list_product'])));
      expect(find.text('How many in stock'), findsNothing);
      expect(find.textContaining('Made from your finished job'), findsOneWidget);
    });
  });
}
