import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/models/recycling.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/listings_controller.dart';
import 'package:ewaste_opportunity/providers/photo_providers.dart';
import 'package:ewaste_opportunity/providers/recycling_providers.dart';
import 'package:ewaste_opportunity/screens/recycling/center_details_screen.dart';
import 'package:ewaste_opportunity/screens/recycling/centers_screen.dart';
import 'package:ewaste_opportunity/screens/recycling/recycle_screen.dart';
import 'package:ewaste_opportunity/screens/recycling/recycling_details_screen.dart';
import 'package:ewaste_opportunity/screens/recycling/recycling_requests_screen.dart';
import 'package:ewaste_opportunity/widgets/app_chip.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';

Future<void> _pump(WidgetTester tester, Widget screen, FakeRecyclingRepository repo) async {
  tester.view.physicalSize = const Size(900, 3000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, __) => Scaffold(body: screen)),
      GoRoute(path: '/recycling/centres/:id', builder: (_, s) => Scaffold(body: Text('centre page ${s.pathParameters['id']}'))),
      GoRoute(path: '/recycling/new', builder: (_, s) => Scaffold(body: Text('form for ${s.uri.queryParameters['center']}'))),
      GoRoute(path: '/recycling/requests/:id', builder: (_, s) => Scaffold(body: Text('request page ${s.pathParameters['id']}'))),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
        recyclingRepositoryProvider.overrideWithValue(repo),
        deviceRepositoryProvider.overrideWithValue(FakeDeviceRepository()),
        photoPickerProvider.overrideWithValue(FakePhotoPicker()),
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

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Finder _inDialog(String text) => find.descendant(of: find.byType(AlertDialog), matching: find.text(text));

void main() {
  group('centres', () {
    testWidgets('the directory shows each centre with what it accepts and its rating', (tester) async {
      final repo = FakeRecyclingRepository(centerList: [sampleCenter(), sampleCenter(id: 'ce2', name: 'EcoWorks')]);
      await _pump(tester, const CentersScreen(), repo);

      expect(find.text('GreenCycle Recyclers'), findsOneWidget);
      expect(find.text('EcoWorks'), findsOneWidget);
      expect(find.text('Accepts: Phones, Laptops'), findsNWidgets(2));
      expect(find.text('4.5 (12 reviews)'), findsNWidgets(2));
      expect(find.text('Authorised'), findsNWidgets(2));
    });

    testWidgets('a category chip filters the directory, and tapping again clears it', (tester) async {
      final repo = FakeRecyclingRepository(centerList: [sampleCenter()]);
      await _pump(tester, const CentersScreen(), repo);

      await _tap(tester, find.widgetWithText(AppChip, 'Phones'));
      expect(repo.centerQueries.last.category, 'phones');
      await _tap(tester, find.widgetWithText(AppChip, 'Phones'));
      expect(repo.centerQueries.last.category, '');
    });

    testWidgets('searching asks for that text after a short pause', (tester) async {
      final repo = FakeRecyclingRepository(centerList: [sampleCenter()]);
      await _pump(tester, const CentersScreen(), repo);

      await tester.enterText(find.byType(TextField), 'green');
      await tester.pump(const Duration(milliseconds: 500));
      await _settle(tester);
      expect(repo.centerQueries.last.q, 'green');
    });

    testWidgets('says so when no centre matches', (tester) async {
      await _pump(tester, const CentersScreen(), FakeRecyclingRepository());
      expect(find.text('No recycling centres found'), findsOneWidget);
    });

    testWidgets('tapping a centre opens it', (tester) async {
      await _pump(tester, const CentersScreen(), FakeRecyclingRepository(centerList: [sampleCenter()]));
      await _tap(tester, find.text('GreenCycle Recyclers'));
      expect(find.text('centre page ce1'), findsOneWidget);
    });

    testWidgets('a centre page shows its details and sends devices to the form', (tester) async {
      await _pump(tester, const CenterDetailsScreen(id: 'ce1'), FakeRecyclingRepository(centerList: [sampleCenter()]));

      expect(find.text('GreenCycle Recyclers'), findsOneWidget);
      expect(find.text('Authorised'), findsOneWidget);
      expect(find.text('Mon to Sat, 9 am to 6 pm'), findsOneWidget);
      expect(find.text('Phones'), findsOneWidget);
      expect(find.textContaining('Licensed e-waste facility'), findsOneWidget);
      expect(find.textContaining('Collects from North Bengaluru'), findsOneWidget);
      expect(find.textContaining('120.5 kg of materials recovered'), findsOneWidget);

      await _tap(tester, find.text('Send devices here'));
      expect(find.text('form for ce1'), findsOneWidget);
    });
  });

  group('the request form', () {
    testWidgets('asks for the kind of device and the pickup place before sending', (tester) async {
      final repo = FakeRecyclingRepository(centerList: [sampleCenter()]);
      await _pump(tester, const RecycleScreen(centerId: 'ce1'), repo);

      await _tap(tester, find.text('Send request'));
      expect(find.text('Choose at least one kind of device'), findsOneWidget);
      expect(find.text('Enter the area or locality'), findsOneWidget);
      expect(find.text('Enter the full pickup address'), findsOneWidget);
      expect(repo.calls, isEmpty);
    });

    testWidgets('sends the chosen kinds, the count and the address, then opens the request', (tester) async {
      final repo = FakeRecyclingRepository(centerList: [sampleCenter()]);
      await _pump(tester, const RecycleScreen(centerId: 'ce1'), repo);

      await _tap(tester, find.widgetWithText(AppChip, 'Phones'));
      await _tap(tester, find.widgetWithText(AppChip, 'Laptops'));
      await _tap(tester, find.byTooltip('One more'));
      await _tap(tester, find.byTooltip('One more'));
      await tester.enterText(find.widgetWithText(TextFormField, 'Area or locality'), 'Indiranagar');
      await tester.enterText(find.widgetWithText(TextFormField, 'Full pickup address'), '12 MG Road, Indiranagar');
      await _tap(tester, find.text('Send request'));

      expect(repo.calls, ['create:ce1:c1|c2:3:Indiranagar:12 MG Road, Indiranagar::0:-']);
      expect(find.text('request page rr-new'), findsOneWidget);
    });

    testWidgets('the count cannot go below one', (tester) async {
      await _pump(tester, const RecycleScreen(centerId: 'ce1'), FakeRecyclingRepository(centerList: [sampleCenter()]));
      expect(tester.widget<IconButton>(find.widgetWithIcon(IconButton, Icons.remove_circle_outline)).onPressed, isNull);
    });

    testWidgets('shows what the server refused', (tester) async {
      final repo = FakeRecyclingRepository(centerList: [sampleCenter()])..actionError = const ApiException('This recycling centre is not available', code: 'CENTER_UNAVAILABLE');
      await _pump(tester, const RecycleScreen(centerId: 'ce1'), repo);

      await _tap(tester, find.widgetWithText(AppChip, 'Phones'));
      await tester.enterText(find.widgetWithText(TextFormField, 'Area or locality'), 'Indiranagar');
      await tester.enterText(find.widgetWithText(TextFormField, 'Full pickup address'), '12 MG Road, Indiranagar');
      await _tap(tester, find.text('Send request'));

      expect(find.text('This recycling centre is not available'), findsOneWidget);
      expect(find.text('request page rr-new'), findsNothing);
    });

    testWidgets('a centre that lists no categories cannot take a request yet', (tester) async {
      final bare = RecyclingCenter.fromJson(const {'_id': 'ce1', 'name': 'Bare Centre', 'city': 'Bengaluru', 'authorized': true, 'acceptedCategories': <Object>[]});
      await _pump(tester, const RecycleScreen(centerId: 'ce1'), FakeRecyclingRepository(centerList: [bare]));
      expect(find.textContaining('has not listed what it accepts'), findsOneWidget);
    });
  });

  group('the list', () {
    testWidgets('shows each request with who it is with, the devices and the status', (tester) async {
      final repo = FakeRecyclingRepository(pages: {
        1: [sampleRecycling(id: 'a', status: 'accepted'), sampleRecycling(id: 'b', status: 'completed')],
      });
      await _pump(tester, const RecyclingRequestsScreen(), repo);

      expect(find.text('GreenCycle Recyclers'), findsNWidgets(2));
      expect(find.text('3 devices · Phones'), findsNWidgets(2));
      expect(find.text('Accepted'), findsWidgets);
      expect(find.text('Completed'), findsWidgets);
    });

    testWidgets('a status chip asks for that status', (tester) async {
      final repo = FakeRecyclingRepository();
      await _pump(tester, const RecyclingRequestsScreen(), repo);
      expect(find.text('No recycling requests yet'), findsOneWidget);

      await _tap(tester, find.widgetWithText(AppChip, 'Completed'));
      expect(repo.listCalls.last.status, 'completed');
      expect(find.text('Nothing here'), findsOneWidget);
    });

    testWidgets('a centre sees its own wording and the sender\'s name', (tester) async {
      final repo = FakeRecyclingRepository(pages: {
        1: [sampleRecycling(role: 'center')],
      });
      await _pump(tester, const RecyclingRequestsScreen(), repo);

      expect(find.text('Asha'), findsOneWidget);
      expect(find.text('New request'), findsOneWidget);
    });

    testWidgets('tapping a request opens it', (tester) async {
      await _pump(tester, const RecyclingRequestsScreen(), FakeRecyclingRepository(pages: {1: [sampleRecycling(id: 'zz')]}));
      await _tap(tester, find.text('GreenCycle Recyclers'));
      expect(find.text('request page zz'), findsOneWidget);
    });
  });

  group('a request, for the person who sent it', () {
    testWidgets('shows the devices, the pickup address, the hint and the history', (tester) async {
      await _pump(tester, const RecyclingDetailsScreen(id: 'rr1'), FakeRecyclingRepository(current: sampleRecycling(actions: ['cancel'])));

      expect(find.text('GreenCycle Recyclers'), findsOneWidget);
      expect(find.text('Waiting for the centre'), findsWidgets);
      expect(find.textContaining('Waiting for GreenCycle Recyclers to accept'), findsOneWidget);
      expect(find.text('12 MG Road, Indiranagar'), findsOneWidget);
      expect(find.text('Ring the bell'), findsOneWidget);
      expect(find.text('History'), findsOneWidget);
    });

    testWidgets('cancelling asks for an optional reason and shows the result', (tester) async {
      final repo = FakeRecyclingRepository(current: sampleRecycling(actions: ['cancel']))..result = sampleRecycling(status: 'cancelled', cancelReason: 'Changed my mind');
      await _pump(tester, const RecyclingDetailsScreen(id: 'rr1'), repo);

      await _tap(tester, find.text('Cancel request'));
      await tester.enterText(find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextField)), 'Changed my mind');
      await _tap(tester, _inDialog('Cancel request'));

      expect(repo.calls, ['cancel:Changed my mind']);
      expect(find.text('Cancelled'), findsWidgets);
      expect(find.text('Reason: Changed my mind'), findsOneWidget);
      expect(find.text('Cancel request'), findsNothing);
    });

    testWidgets('handing over needs the data-protection checklist ticked first', (tester) async {
      final repo = FakeRecyclingRepository(
        current: sampleRecycling(status: 'pickup_scheduled', actions: ['confirm_handover', 'cancel'], pickup: {'date': '2026-11-20T10:00:00.000Z', 'timeSlot': 'Morning'}),
      );
      await _pump(tester, const RecyclingDetailsScreen(id: 'rr1'), repo);
      expect(find.text('Time slot'), findsOneWidget);

      await _tap(tester, find.text('Confirm the handover'));
      expect(find.text('Before you hand it over'), findsOneWidget);
      expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Confirm handover')).onPressed, isNull);

      await _tap(tester, find.text('I have done this'));
      await _tap(tester, find.widgetWithText(FilledButton, 'Confirm handover'));
      expect(repo.calls, ['handover:checklist']);
    });

    testWidgets('shows both sides of the handover while it is waiting', (tester) async {
      final repo = FakeRecyclingRepository(current: sampleRecycling(status: 'pickup_scheduled', byUser: true, actions: []));
      await _pump(tester, const RecyclingDetailsScreen(id: 'rr1'), repo);

      expect(find.text('You confirmed the handover'), findsOneWidget);
      expect(find.text('The centre confirmed (not yet)'), findsOneWidget);
      expect(find.textContaining('Waiting for GreenCycle Recyclers to confirm too'), findsOneWidget);
    });

    testWidgets('a finished request lists what was recovered, measured and estimated apart', (tester) async {
      final repo = FakeRecyclingRepository(
        current: sampleRecycling(status: 'completed', materials: [
          {'type': 'copper', 'actualKg': 4.5, 'estimatedKg': null},
          {'type': 'plastics', 'actualKg': null, 'estimatedKg': 2},
        ]),
      );
      await _pump(tester, const RecyclingDetailsScreen(id: 'rr1'), repo);

      expect(find.text('Recovered materials'), findsOneWidget);
      expect(find.text('measured 4.5 kg'), findsOneWidget);
      expect(find.text('not weighed · estimated 2 kg'), findsOneWidget);
      expect(find.text('Measured total: 4.5 kg'), findsOneWidget);
      expect(find.text('Estimated total (not weighed): 2 kg'), findsOneWidget);
    });

    testWidgets('a declined request shows why', (tester) async {
      await _pump(tester, const RecyclingDetailsScreen(id: 'rr1'), FakeRecyclingRepository(current: sampleRecycling(status: 'rejected', cancelReason: 'We do not take phones')));
      expect(find.text('Reason: We do not take phones'), findsOneWidget);
      expect(find.textContaining('declined this request'), findsOneWidget);
    });

    testWidgets('if the other side changed it first, says so and shows the new state', (tester) async {
      final repo = FakeRecyclingRepository(current: sampleRecycling(actions: ['cancel']))
        ..actionError = const ApiException('This request was just changed. Reload the page and try again.', code: 'STALE_STATE', failure: ApiFailure.conflict);
      await _pump(tester, const RecyclingDetailsScreen(id: 'rr1'), repo);

      await _tap(tester, find.text('Cancel request'));
      await _tap(tester, _inDialog('Cancel request'));
      expect(find.text('This request was just changed. Reload the page and try again.'), findsOneWidget);
    });
  });

  group('a request, for the recycling centre', () {
    testWidgets('a new request can be accepted', (tester) async {
      final repo = FakeRecyclingRepository(current: sampleRecycling(role: 'center', address: false, actions: ['accept', 'reject']))
        ..result = sampleRecycling(role: 'center', status: 'accepted', actions: ['schedule_pickup', 'cancel']);
      await _pump(tester, const RecyclingDetailsScreen(id: 'rr1'), repo);

      expect(find.text('New request'), findsWidgets);
      expect(find.text('Asha'), findsOneWidget);
      expect(find.text('The exact address is shown once you accept.'), findsOneWidget);
      expect(find.text('12 MG Road, Indiranagar'), findsNothing);

      await _tap(tester, find.text('Accept request'));
      expect(repo.calls, ['accept']);
      expect(find.text('Schedule pickup'), findsOneWidget);
      expect(find.text('Accept request'), findsNothing);
    });

    testWidgets('declining needs a reason', (tester) async {
      final repo = FakeRecyclingRepository(current: sampleRecycling(role: 'center', address: false, actions: ['accept', 'reject']));
      await _pump(tester, const RecyclingDetailsScreen(id: 'rr1'), repo);

      await _tap(tester, find.text('Decline request'));
      await _tap(tester, _inDialog('Decline'));
      expect(find.text('Please give a short reason'), findsOneWidget);
      expect(repo.calls, isEmpty);

      await tester.enterText(find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextField)), 'We do not take phones');
      await _tap(tester, _inDialog('Decline'));
      expect(repo.calls, ['reject:We do not take phones']);
    });

    testWidgets('collecting the devices is confirmed without the sender\'s checklist', (tester) async {
      final repo = FakeRecyclingRepository(current: sampleRecycling(role: 'center', status: 'pickup_scheduled', actions: ['confirm_handover', 'cancel']));
      await _pump(tester, const RecyclingDetailsScreen(id: 'rr1'), repo);

      await _tap(tester, find.text('Confirm the handover'));
      expect(find.text('Have you collected the devices?'), findsOneWidget);
      await _tap(tester, _inDialog('Yes, I have them'));
      expect(repo.calls, ['handover:plain']);
    });

    testWidgets('recording materials sends measured and estimated weights apart', (tester) async {
      final repo = FakeRecyclingRepository(current: sampleRecycling(role: 'center', status: 'received_at_center', actions: ['record_materials']));
      await _pump(tester, const RecyclingDetailsScreen(id: 'rr1'), repo);

      await _tap(tester, find.text('Record recovered materials'));
      expect(find.text('What was recovered?'), findsOneWidget);

      // Saving with nothing entered is refused.
      await _tap(tester, find.text('Save materials'));
      expect(find.text('Add a weight for at least one material.'), findsOneWidget);
      expect(repo.calls, isEmpty);

      await tester.enterText(find.widgetWithText(TextFormField, 'Copper measured (kg)'), '4.5');
      await tester.enterText(find.widgetWithText(TextFormField, 'Plastics estimated (kg)'), '2');
      await tester.enterText(find.widgetWithText(TextFormField, 'Report notes (optional)'), 'Sorted by hand');
      await _tap(tester, find.text('Save materials'));

      expect(repo.calls, ['materials:copper=4.5/-,plastics=-/2.0:Sorted by hand']);
    });

    testWidgets('a weight that is not a number is refused in the form', (tester) async {
      final repo = FakeRecyclingRepository(current: sampleRecycling(role: 'center', status: 'received_at_center', actions: ['record_materials']));
      await _pump(tester, const RecyclingDetailsScreen(id: 'rr1'), repo);

      await _tap(tester, find.text('Record recovered materials'));
      await tester.enterText(find.widgetWithText(TextFormField, 'Copper measured (kg)'), 'lots');
      await _tap(tester, find.text('Save materials'));
      expect(find.text('Enter a number'), findsOneWidget);
      expect(repo.calls, isEmpty);
    });

    testWidgets('processing needs the materials first, and completing asks for a check', (tester) async {
      final done = sampleRecycling(role: 'center', status: 'processed', actions: ['record_materials', 'complete'], materials: [
        {'type': 'copper', 'actualKg': 4.5, 'estimatedKg': null},
      ]);
      final repo = FakeRecyclingRepository(current: done);
      await _pump(tester, const RecyclingDetailsScreen(id: 'rr1'), repo);

      expect(find.text('Edit recovered materials'), findsOneWidget);
      await _tap(tester, find.text('Complete the request'));
      expect(find.descendant(of: find.byType(AlertDialog), matching: find.textContaining('become the sender\'s verified impact')), findsOneWidget);
      await _tap(tester, _inDialog('Complete'));
      expect(repo.calls, ['complete']);
    });

    testWidgets('receiving the devices is confirmed first', (tester) async {
      final repo = FakeRecyclingRepository(current: sampleRecycling(role: 'center', status: 'collected', actions: ['mark_received']));
      await _pump(tester, const RecyclingDetailsScreen(id: 'rr1'), repo);

      await _tap(tester, find.text('Mark as received'));
      await _tap(tester, _inDialog('Yes, received'));
      expect(repo.calls, ['received']);
    });
  });
}

