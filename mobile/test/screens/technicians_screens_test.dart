import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/listings_controller.dart';
import 'package:ewaste_opportunity/providers/technicians_controller.dart';
import 'package:ewaste_opportunity/routes/route_paths.dart';
import 'package:ewaste_opportunity/screens/technicians/request_repair_screen.dart';
import 'package:ewaste_opportunity/screens/technicians/technician_details_screen.dart';
import 'package:ewaste_opportunity/screens/technicians/technicians_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';

Future<void> _pump(
  WidgetTester tester, {
  required String location,
  FakeTechnicianRepository? technicians,
  FakeRequestRepository? requests,
  FakeDeviceRepository? devices,
}) async {
  tester.view.physicalSize = const Size(900, 2600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    initialLocation: location,
    routes: [
      GoRoute(path: Routes.technicians, builder: (_, state) => TechniciansPage(listingId: state.uri.queryParameters['listing'])),
      GoRoute(
        path: Routes.technicianPattern,
        builder: (_, state) => TechnicianDetailsScreen(id: state.pathParameters['id']!, listingId: state.uri.queryParameters['listing']),
      ),
      GoRoute(
        path: Routes.newRequest,
        builder: (_, state) => RequestRepairScreen(listingId: state.uri.queryParameters['listing'], technicianId: state.uri.queryParameters['technician']),
      ),
      GoRoute(path: Routes.requestPattern, builder: (_, state) => Scaffold(body: Text('Opened request ${state.pathParameters['id']}'))),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
        technicianRepositoryProvider.overrideWithValue(technicians ?? FakeTechnicianRepository()),
        requestRepositoryProvider.overrideWithValue(requests ?? FakeRequestRepository()),
        deviceRepositoryProvider.overrideWithValue(devices ?? FakeDeviceRepository()),
      ],
      child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
    ),
  );
  // Skeletons pulse forever, so wait a fixed time rather than for everything to settle.
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 50));
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pump(const Duration(milliseconds: 100));
}

void main() {
  group('technician directory', () {
    testWidgets('lists technicians with rating, availability and area', (tester) async {
      final repo = FakeTechnicianRepository(pages: {1: [sampleTechnician(name: 'Ravi Kumar'), sampleTechnician(id: 't2', name: 'Meena Iyer', availability: 'limited')]});
      await _pump(tester, location: Routes.technicians, technicians: repo);

      expect(find.text('Ravi Kumar'), findsOneWidget);
      expect(find.text('Meena Iyer'), findsOneWidget);
      expect(find.text('4.5 (12 reviews)'), findsNWidgets(2));
      expect(find.text('Available'), findsOneWidget);
      expect(find.text('Limited availability'), findsOneWidget);
      expect(find.text('Indiranagar, Bengaluru'), findsNWidgets(2));
    });

    testWidgets('says so when nobody matches', (tester) async {
      await _pump(tester, location: Routes.technicians);
      expect(find.text('No technicians found'), findsOneWidget);
    });

    testWidgets('"Available now" asks the server for available technicians only', (tester) async {
      final repo = FakeTechnicianRepository(pages: {1: [sampleTechnician()]});
      await _pump(tester, location: Routes.technicians, technicians: repo);

      await _tap(tester, find.text('Available now'));
      expect(repo.queries.last.availableOnly, isTrue);

      await _tap(tester, find.text('Available now'));
      expect(repo.queries.last.availableOnly, isFalse);
    });

    testWidgets('an offline failure offers to try again', (tester) async {
      final repo = FakeTechnicianRepository(error: ApiException.offline);
      await _pump(tester, location: Routes.technicians, technicians: repo);
      expect(find.text('You seem to be offline'), findsOneWidget);

      repo.error = null;
      repo.pages = {1: [sampleTechnician(name: 'Back Online')]};
      await _tap(tester, find.text('Try again'));
      expect(find.text('Back Online'), findsOneWidget);
    });

    testWidgets('opening a technician keeps the device the person is repairing', (tester) async {
      final repo = FakeTechnicianRepository(pages: {1: [sampleTechnician()]});
      await _pump(tester, location: Routes.techniciansFor(listing: 'l9'), technicians: repo);

      await _tap(tester, find.text('Ravi Kumar'));
      expect(find.text('Ask Ravi to repair my device'), findsOneWidget);

      await _tap(tester, find.text('Ask Ravi to repair my device'));
      // the request form for that device and technician is open
      expect(find.text('Which device?'), findsOneWidget);
      expect(find.text('Ravi Kumar'), findsOneWidget);
    });
  });

  group('technician details', () {
    testWidgets('shows the profile and the payment note', (tester) async {
      await _pump(tester, location: Routes.technician('t1'));
      expect(find.text('Ravi Kumar'), findsOneWidget);
      expect(find.text('Phone and laptop repairs'), findsOneWidget);
      expect(find.text('Screens'), findsOneWidget);
      expect(find.textContaining('never handles money'), findsOneWidget);
    });
  });

  group('request form', () {
    testWidgets('an empty description is not sent', (tester) async {
      final requests = FakeRequestRepository();
      await _pump(tester, location: Routes.requestRepair(listing: 'l1', technician: 't1'), requests: requests);

      await _tap(tester, find.text('Send request'));
      expect(find.text('Tell the technician what is wrong'), findsOneWidget);
      expect(requests.calls, isEmpty);
    });

    testWidgets('sends the request for the chosen device and technician, then opens it', (tester) async {
      final requests = FakeRequestRepository();
      await _pump(tester, location: Routes.requestRepair(listing: 'l1', technician: 't1'), requests: requests);

      await tester.enterText(find.byType(TextFormField), 'Screen is cracked');
      await _tap(tester, find.text('Send request'));

      expect(requests.calls, ['create:l1:t1:collect:Screen is cracked']);
      expect(find.text('Opened request new1'), findsOneWidget);
    });

    testWidgets('the on-site switch is passed on', (tester) async {
      final requests = FakeRequestRepository();
      await _pump(tester, location: Routes.requestRepair(listing: 'l1', technician: 't1'), requests: requests);

      await tester.enterText(find.byType(TextFormField), 'Will not charge');
      await _tap(tester, find.byType(Switch));
      await _tap(tester, find.text('Send request'));

      expect(requests.calls.single, contains(':onsite:'));
    });

    testWidgets('an open request is posted without a technician', (tester) async {
      final requests = FakeRequestRepository();
      await _pump(tester, location: Routes.requestRepair(listing: 'l1'), requests: requests);

      expect(find.textContaining('Open request: any suitable'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField), 'Battery drains fast');
      await _tap(tester, find.text('Post request'));
      expect(requests.calls.single, startsWith('create:l1:open:'));
    });

    testWidgets('without a device chosen, the person picks one of their repairable listings', (tester) async {
      final requests = FakeRequestRepository();
      final devices = FakeDeviceRepository(pages: {1: [sampleListing(id: 'l7', title: 'Dell laptop', isOwner: true)]});
      await _pump(tester, location: Routes.requestRepair(), requests: requests, devices: devices);

      // nothing chosen yet
      await tester.enterText(find.byType(TextFormField), 'Keyboard is dead');
      await _tap(tester, find.text('Post request'));
      expect(find.text('Choose the device to repair'), findsOneWidget);
      expect(requests.calls, isEmpty);

      await _tap(tester, find.text('Dell laptop'));
      await _tap(tester, find.text('Post request'));
      expect(requests.calls.single, startsWith('create:l7:open:'));
      expect(devices.queries.first.service, 'repair');
      expect(devices.queries.first.status, 'listed');
      expect(devices.queries.first.mine, isTrue);
    });

    testWidgets('with nothing ready for repair it points to listing a device', (tester) async {
      await _pump(tester, location: Routes.requestRepair());
      expect(find.text('No device ready for repair'), findsOneWidget);
    });

    testWidgets('the server\'s refusal is shown and nothing opens', (tester) async {
      final requests = FakeRequestRepository()..actionError = const ApiException('This listing already has an active service', failure: ApiFailure.conflict, statusCode: 409);
      await _pump(tester, location: Routes.requestRepair(listing: 'l1', technician: 't1'), requests: requests);

      await tester.enterText(find.byType(TextFormField), 'Screen is cracked');
      await _tap(tester, find.text('Send request'));

      expect(find.text('This listing already has an active service'), findsOneWidget);
      expect(find.textContaining('Opened request'), findsNothing);
    });
  });
}
