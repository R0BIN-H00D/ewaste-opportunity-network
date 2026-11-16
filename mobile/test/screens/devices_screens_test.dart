import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/listings_controller.dart';
import 'package:ewaste_opportunity/screens/devices/browse_screen.dart';
import 'package:ewaste_opportunity/screens/devices/device_details_screen.dart';
import 'package:ewaste_opportunity/screens/devices/my_listings_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';

Future<void> _pump(WidgetTester tester, Widget screen, FakeDeviceRepository repo) async {
  tester.view.physicalSize = const Size(900, 2600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
        deviceRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp(theme: AppTheme.light(), home: Scaffold(body: screen)),
    ),
  );
  // Skeletons pulse forever, so wait a fixed time rather than for everything to settle.
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  group('BrowseScreen', () {
    testWidgets('shows skeletons first, then the listings', (tester) async {
      final repo = FakeDeviceRepository(pages: {1: [sampleListing(id: 'a', title: 'Old Samsung phone'), sampleListing(id: 'b', title: 'Dell laptop')]});
      await _pump(tester, const BrowseScreen(), repo);

      expect(find.text('Old Samsung phone'), findsOneWidget);
      expect(find.text('Dell laptop'), findsOneWidget);
      expect(find.text('₹1,500'), findsNWidgets(2));
      expect(find.text('Repair'), findsWidgets);
    });

    testWidgets('says so when nothing matches', (tester) async {
      await _pump(tester, const BrowseScreen(), FakeDeviceRepository());
      expect(find.text('No devices found'), findsOneWidget);
    });

    testWidgets('an offline failure offers to try again, and trying again loads the list', (tester) async {
      final repo = FakeDeviceRepository(error: ApiException.offline);
      await _pump(tester, const BrowseScreen(), repo);

      expect(find.text('You seem to be offline'), findsOneWidget);

      repo.error = null;
      repo.pages = {1: [sampleListing(title: 'Back online phone')]};
      await tester.tap(find.text('Try again'));
      await tester.pump(const Duration(milliseconds: 50));
      await tester.pump(const Duration(milliseconds: 50));

      expect(find.text('Back online phone'), findsOneWidget);
    });

    testWidgets('choosing a service chip asks the server for that service', (tester) async {
      final repo = FakeDeviceRepository(pages: {1: [sampleListing()]});
      await _pump(tester, const BrowseScreen(), repo);

      await tester.tap(find.text('Donation'));
      await tester.pump(const Duration(milliseconds: 50));

      expect(repo.queries.last.service, 'donation');
    });

    testWidgets('typing in search waits for a pause, then asks once', (tester) async {
      final repo = FakeDeviceRepository(pages: {1: [sampleListing()]});
      await _pump(tester, const BrowseScreen(), repo);
      final before = repo.queries.length;

      await tester.enterText(find.widgetWithText(TextField, 'Search devices'), 'lap');
      await tester.pump(const Duration(milliseconds: 100));
      await tester.enterText(find.widgetWithText(TextField, 'Search devices'), 'laptop');
      await tester.pump(const Duration(milliseconds: 500));

      expect(repo.queries.length, before + 1);
      expect(repo.queries.last.q, 'laptop');
    });

    testWidgets('the filter sheet applies a condition', (tester) async {
      final repo = FakeDeviceRepository(pages: {1: [sampleListing()]}, categoryList: const [Category(id: 'c1', name: 'Phones', slug: 'phones')]);
      await _pump(tester, const BrowseScreen(), repo);

      await tester.tap(find.byIcon(Icons.tune));
      // The sheet slides up: the first frame starts the animation, the next ones play it.
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));
      expect(find.text('Filters'), findsOneWidget);
      expect(find.text('Phones'), findsWidgets);

      await tester.tap(find.text('Not working'));
      await tester.pump();
      await tester.tap(find.text('Show results'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 400));
      await tester.pump(const Duration(milliseconds: 400));

      expect(repo.queries.last.condition, 'not_working');
    });
  });

  group('MyListingsScreen', () {
    testWidgets('asks for the person\'s own listings and shows a status badge', (tester) async {
      final repo = FakeDeviceRepository(pages: {1: [sampleListing(title: 'My tablet', isOwner: true, status: 'in_service')]});
      await _pump(tester, const MyListingsScreen(), repo);

      expect(repo.queries.first.mine, isTrue);
      expect(find.text('My tablet'), findsOneWidget);
      expect(find.text('In service'), findsWidgets);
    });

    testWidgets('an empty list invites the person to list a device', (tester) async {
      await _pump(tester, const MyListingsScreen(), FakeDeviceRepository());
      expect(find.text('You have not listed anything yet'), findsOneWidget);
      expect(find.widgetWithText(FilledButton, 'List a device'), findsOneWidget);
    });

    testWidgets('choosing a status filters on the server', (tester) async {
      final repo = FakeDeviceRepository(pages: {1: [sampleListing(isOwner: true)]});
      await _pump(tester, const MyListingsScreen(), repo);

      await tester.tap(find.text('Withdrawn'));
      await tester.pump(const Duration(milliseconds: 50));

      expect(repo.queries.last.status, 'withdrawn');
      expect(repo.queries.last.mine, isTrue);
    });
  });

  group('DeviceDetailsScreen', () {
    testWidgets('shows the facts, the area note and the owner\'s controls', (tester) async {
      await _pump(tester, const DeviceDetailsScreen(id: 'l9'), FakeDeviceRepository());

      expect(find.text('Old Samsung phone'), findsWidgets);
      expect(find.text('Minor damage'), findsWidgets);
      expect(find.textContaining('Only the area is shown'), findsOneWidget);
      expect(find.text('Your listing'), findsOneWidget);
      expect(find.text('Remove listing'), findsOneWidget);
    });
  });
}
