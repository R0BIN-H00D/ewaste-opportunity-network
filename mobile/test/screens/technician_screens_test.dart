import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/service_request.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/listings_controller.dart';
import 'package:ewaste_opportunity/providers/photo_providers.dart';
import 'package:ewaste_opportunity/providers/technicians_controller.dart';
import 'package:ewaste_opportunity/screens/requests/jobs_screen.dart';
import 'package:ewaste_opportunity/screens/requests/request_details_screen.dart';
import 'package:ewaste_opportunity/services/photo_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';
import '../models/request_models_test.dart';

/// A request as the technician's side of `GET /api/service-requests/:id` sends it.
ServiceRequest _job({String status = 'request_submitted', List<String> actions = const [], bool quote = false, bool onSite = false}) =>
    ServiceRequest.fromJson(requestJson(status: status, actions: actions, quote: quote, onSite: onSite)..['viewerRole'] = 'technician');

const _photo = PickedPhoto(path: 'missing/done.jpg', name: 'done.jpg', mime: 'image/jpeg', bytes: 1000);

Future<void> _pump(WidgetTester tester, Widget screen, FakeRequestRepository repo, {FakePhotoPicker? picker}) async {
  tester.view.physicalSize = const Size(900, 2600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, __) => Scaffold(body: screen)),
    GoRoute(path: '/requests/:id', builder: (_, s) => Scaffold(body: Text('request ${s.pathParameters['id']}'))),
  ]);
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
        requestRepositoryProvider.overrideWithValue(repo),
        deviceRepositoryProvider.overrideWithValue(FakeDeviceRepository()),
        photoPickerProvider.overrideWithValue(picker ?? FakePhotoPicker()),
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
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Finder _inDialog(String text) => find.descendant(of: find.byType(AlertDialog), matching: find.text(text));
Finder _sheetText(String text) => find.descendant(of: find.byType(BottomSheet), matching: find.text(text));

void main() {
  testWidgets('the technician sees the customer and the area, their own wording, and no owner buttons', (tester) async {
    final repo = FakeRequestRepository(current: _job(status: 'customer_approval_pending', quote: true));
    await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);

    expect(find.text('Customer'), findsOneWidget);
    expect(find.text('Asha'), findsOneWidget);
    expect(find.text('Area'), findsOneWidget);
    expect(find.text('Indiranagar, Bengaluru'), findsOneWidget);
    expect(find.text('Technician'), findsNothing); // that row is the owner's
    expect(find.text('Waiting for approval'), findsWidgets);
    expect(find.text('Your approval needed'), findsNothing);
    expect(find.text('Your quote'), findsOneWidget);
    expect(find.text('The owner pays you directly.'), findsOneWidget);
    expect(find.textContaining('Approve'), findsNothing);
    expect(find.textContaining('Waiting for the owner to approve your quote'), findsOneWidget);
  });

  testWidgets('a new request can be accepted', (tester) async {
    final repo = FakeRequestRepository(current: _job(actions: ['accept', 'reject']))..result = _job(status: 'technician_assigned', actions: ['schedule_pickup']);
    await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);
    expect(find.textContaining('A customer asked for your help'), findsOneWidget);
    await _tap(tester, find.text('Accept this job'));
    expect(repo.calls, ['accept']);
    expect(find.text('You accepted the job'), findsOneWidget);
    expect(find.text('Accept this job'), findsNothing);
  });

  testWidgets('declining a request needs a reason, which the owner sees', (tester) async {
    final repo = FakeRequestRepository(current: _job(actions: ['accept', 'reject']))..result = _job(status: 'rejected');
    await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);

    await _tap(tester, find.text('Decline'));
    await _tap(tester, _inDialog('Decline job'));
    expect(find.text('Please give a short reason'), findsOneWidget);
    expect(repo.calls, isEmpty);

    await tester.enterText(find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextField)), 'Too far away');
    await _tap(tester, _inDialog('Decline job'));
    expect(repo.calls, ['decline:Too far away']);
    expect(find.text('Declined'), findsWidgets);
  });

  testWidgets('the diagnosis starts with one tap', (tester) async {
    final repo = FakeRequestRepository(current: _job(status: 'device_collected', actions: ['start_diagnosis']))..result = _job(status: 'diagnosis_in_progress');
    await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);
    await _tap(tester, find.text('Start diagnosis'));
    expect(repo.calls, ['diagnose']);
    expect(find.text('Diagnosing'), findsWidgets);
  });

  testWidgets('the quote form checks the total against its lines before it sends', (tester) async {
    final repo = FakeRequestRepository(current: _job(status: 'diagnosis_in_progress', actions: ['add_progress', 'submit_quotation']))..result = _job(status: 'customer_approval_pending');
    await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);

    await _tap(tester, find.text('Send quote'));
    await _tap(tester, _sheetText('Send quote').last);
    expect(find.text('Enter an amount'), findsOneWidget);

    await _tap(tester, _sheetText('Add a line'));
    await tester.enterText(find.widgetWithText(TextFormField, 'Line 1'), 'Screen');
    await tester.enterText(find.widgetWithText(TextFormField, '₹'), '600');
    await tester.enterText(find.widgetWithText(TextFormField, 'Total charge (₹)'), '900');
    await _tap(tester, _sheetText('Send quote').last);
    expect(find.text('The total must equal the lines (₹600).'), findsOneWidget);
    expect(repo.calls, isEmpty);

    await tester.enterText(find.widgetWithText(TextFormField, 'Total charge (₹)'), '600');
    await tester.enterText(find.widgetWithText(TextFormField, 'Days needed'), '3');
    await _tap(tester, _sheetText('Send quote').last);
    expect(repo.calls, ['quote:600.0:Screen=600.0:3:7:']);
    expect(find.text('Quote sent'), findsWidgets);
  });

  testWidgets('a revised quote warns that it pauses the repair', (tester) async {
    final repo = FakeRequestRepository(current: _job(status: 'repair_in_progress', actions: ['add_progress', 'revise_quotation', 'complete_repair'], quote: true));
    await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);
    await _tap(tester, find.text('Send a revised quote'));
    expect(find.textContaining('pauses the repair'), findsOneWidget);
  });

  testWidgets('an update needs a note or a photo, and a photo can be taken with the camera', (tester) async {
    final picker = FakePhotoPicker(camera: _photo);
    final repo = FakeRequestRepository(current: _job(status: 'repair_in_progress', actions: ['add_progress', 'complete_repair']));
    await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo, picker: picker);

    await _tap(tester, find.text('Post an update'));
    await _tap(tester, _sheetText('Post update'));
    expect(find.text('Add a note or at least one photo.'), findsOneWidget);
    expect(repo.calls, isEmpty);

    await _tap(tester, _sheetText('Take photo'));
    expect(picker.cameraCalls, 1);
    expect(find.text('Photos: 1 of 4'), findsOneWidget);
    await _tap(tester, _sheetText('Post update'));
    expect(repo.calls, ['progress::1']);
    expect(find.text('Update posted'), findsOneWidget);
  });

  testWidgets('a photo can be removed again, and a file that is not a photo is refused', (tester) async {
    final picker = FakePhotoPicker(gallery: [_photo, const PickedPhoto(path: 'x/notes.pdf', name: 'notes.pdf', mime: 'application/pdf', bytes: 10)]);
    final repo = FakeRequestRepository(current: _job(status: 'repair_in_progress', actions: ['add_progress']));
    await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo, picker: picker);

    await _tap(tester, find.text('Post an update'));
    await _tap(tester, _sheetText('Choose'));
    expect(find.text('Photos: 1 of 4'), findsOneWidget); // only the photo was kept
    expect(find.textContaining('notes.pdf: Only JPEG, PNG or WebP'), findsOneWidget);
    await _tap(tester, find.byTooltip('Remove photo 1'));
    expect(find.text('Photos: 0 of 4'), findsOneWidget);
  });

  testWidgets('finishing the repair needs a photo of the repaired device', (tester) async {
    final picker = FakePhotoPicker(camera: _photo);
    final repo = FakeRequestRepository(current: _job(status: 'repair_in_progress', actions: ['add_progress', 'complete_repair']))..result = _job(status: 'repair_completed');
    await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo, picker: picker);

    await _tap(tester, find.text('Mark repair as done'));
    await _tap(tester, _sheetText('Mark as done'));
    expect(find.text('Add at least one photo of the repaired device.'), findsOneWidget);
    expect(repo.calls, isEmpty);

    await tester.enterText(find.descendant(of: find.byType(BottomSheet), matching: find.byType(TextField)), 'Screen replaced');
    await _tap(tester, _sheetText('Take photo'));
    await _tap(tester, _sheetText('Mark as done'));
    expect(repo.calls, ['complete-repair:Screen replaced:1']);
    expect(find.text('Repair marked as done'), findsOneWidget);
  });

  testWidgets('bringing the device back asks when, and sends the time and window', (tester) async {
    final repo = FakeRequestRepository(current: _job(status: 'repair_completed', actions: ['start_delivery']))..result = _job(status: 'device_delivery_pending');
    await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);
    expect(find.textContaining('Bring the device back and tell the owner'), findsOneWidget);

    await _tap(tester, find.text('Bring the device back'));
    await _tap(tester, _sheetText('Start delivery'));
    expect(find.text('Choose when you will bring it back.'), findsOneWidget);
    expect(repo.calls, isEmpty);

    await _tap(tester, _sheetText('Choose date and time'));
    await _tap(tester, find.text('OK')); // the date (tomorrow, offered by default)
    await _tap(tester, find.text('OK')); // the time (5 pm, offered by default)
    expect(find.text('Choose date and time'), findsNothing);
    await tester.enterText(find.widgetWithText(TextField, 'Time window (optional)'), '17:00-19:00');
    await _tap(tester, _sheetText('Start delivery'));
    expect(repo.calls, ['deliver:date:17:00-19:00']);
    expect(find.text('Delivery started'), findsOneWidget);
  });

  testWidgets('the technician confirms a handover without the owner\'s checklist, and sees who has confirmed', (tester) async {
    final repo = FakeRequestRepository(current: _job(status: 'device_collection_pending', actions: ['schedule_pickup', 'confirm_handover']));
    await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);

    expect(find.text('Collecting the device'), findsOneWidget);
    expect(find.text('You have not confirmed yet'), findsOneWidget);
    expect(find.text('Asha confirmed'), findsOneWidget); // the owner has
    await _tap(tester, find.text('Confirm handover'));
    expect(find.text('Have you got the device?'), findsOneWidget);
    expect(find.text('Before you hand it over'), findsNothing);
    await _tap(tester, _inDialog('Yes, I have it'));
    expect(repo.calls, ['handover:plain']);
  });

  testWidgets('a cancelled request the technician still holds says to return it', (tester) async {
    final json = requestJson(status: 'cancelled')
      ..['viewerRole'] = 'technician'
      ..['handover'] = {
        'collect': {'owner': true, 'provider': true},
        'delivery': {'owner': false, 'provider': false},
      };
    await _pump(tester, const RequestDetailsScreen(id: 'r1'), FakeRequestRepository(current: ServiceRequest.fromJson(json)));
    expect(find.textContaining('You still have the device'), findsOneWidget);
  });

  group('find repair requests and my repair jobs', () {
    testWidgets('find repair requests lists the board, with a Filters button instead of tabs', (tester) async {
      final repo = FakeRequestRepository(pages: {1: [_job()]});
      await _pump(tester, const FindRequestsScreen(), repo);
      expect(repo.asCalls.last, 'board');
      expect(find.text('Asha'), findsOneWidget); // the customer, not the technician
      expect(find.text('New request'), findsOneWidget);
      expect(find.text('Filters'), findsOneWidget);
      expect(find.text('In progress'), findsNothing);
    });

    testWidgets('the filters narrow the loaded requests by on-site, and clear again', (tester) async {
      final repo = FakeRequestRepository(pages: {1: [_job(onSite: true), _job()]});
      await _pump(tester, const FindRequestsScreen(), repo);
      expect(find.text('Old Samsung phone'), findsNWidgets(2));
      await _tap(tester, find.text('Filters'));
      await _tap(tester, _sheetText('On-site repairs only'));
      await _tap(tester, _sheetText('Show results'));
      expect(find.text('Old Samsung phone'), findsOneWidget);
      expect(find.text('Filters (1)'), findsOneWidget);
      await _tap(tester, find.text('Filters (1)'));
      await _tap(tester, _sheetText('Clear all filters'));
      expect(find.text('Old Samsung phone'), findsNWidgets(2));
    });

    testWidgets('says so when there is nothing', (tester) async {
      await _pump(tester, const FindRequestsScreen(), FakeRequestRepository());
      expect(find.text('No new requests'), findsOneWidget);
    });

    testWidgets('opening a request shows it', (tester) async {
      final repo = FakeRequestRepository(pages: {1: [_job(status: 'repair_in_progress')]});
      await _pump(tester, const FindRequestsScreen(), repo);
      await _tap(tester, find.text('Old Samsung phone'));
      expect(find.text('request r1'), findsOneWidget);
    });

    testWidgets('my repair jobs opens on the jobs in progress, and the filter switches to all jobs', (tester) async {
      final repo = FakeRequestRepository(pages: {1: [_job(status: 'repair_in_progress')]});
      await _pump(tester, const MyJobsPage(), repo);
      await tester.pump(const Duration(milliseconds: 200));
      expect((as: repo.asCalls.last, active: repo.listCalls.last.activeOnly), (as: 'technician', active: true));
      expect(find.text('In progress'), findsNothing); // no row of tabs
      await _tap(tester, find.text('Filters'));
      await _tap(tester, _sheetText('All jobs'));
      await _tap(tester, _sheetText('Show results'));
      expect((as: repo.asCalls.last, active: repo.listCalls.last.activeOnly), (as: 'technician', active: false));
    });

    testWidgets('my repair jobs says so when there is nothing, and points to the requests', (tester) async {
      await _pump(tester, const MyJobsPage(), FakeRequestRepository());
      await tester.pump(const Duration(milliseconds: 200));
      expect(find.text('No jobs in progress'), findsOneWidget);
      expect(find.text('Find repair requests'), findsWidgets);
    });
  });
}
