import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/service_request.dart';
import 'package:ewaste_opportunity/widgets/listing_photo.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/listings_controller.dart';
import 'package:ewaste_opportunity/providers/technicians_controller.dart';
import 'package:ewaste_opportunity/screens/requests/request_details_screen.dart';
import 'package:ewaste_opportunity/screens/requests/requests_screen.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';
import '../models/request_models_test.dart';

Future<void> _pump(WidgetTester tester, Widget screen, FakeRequestRepository repo) async {
  tester.view.physicalSize = const Size(900, 2600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);

  final router = GoRouter(routes: [GoRoute(path: '/', builder: (_, __) => Scaffold(body: screen))]);
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository()),
        requestRepositoryProvider.overrideWithValue(repo),
        deviceRepositoryProvider.overrideWithValue(FakeDeviceRepository()),
      ],
      child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
    ),
  );
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 50));
}

/// Taps and lets a dialog or answer finish (the pulsing skeletons keep `pumpAndSettle` from ever returning).
Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Finder _inDialog(String text) => find.descendant(of: find.byType(AlertDialog), matching: find.text(text));

void main() {
  group('request list', () {
    testWidgets('shows each request with its device, technician and status', (tester) async {
      final repo = FakeRequestRepository(pages: {
        1: [sampleRequest(id: 'a', status: 'customer_approval_pending'), sampleRequest(id: 'b', status: 'service_completed')]
      });
      await _pump(tester, const RequestsScreen(), repo);

      expect(find.text('Old Samsung phone'), findsNWidgets(2));
      expect(find.text('Ravi Kumar'), findsNWidgets(2));
      expect(find.text('Your approval needed'), findsOneWidget);
      expect(find.text('Completed'), findsOneWidget);
    });

    testWidgets('says so when there are none, and "Open" asks only for open ones', (tester) async {
      final repo = FakeRequestRepository();
      await _pump(tester, const RequestsScreen(), repo);
      expect(find.text('No repair requests yet'), findsOneWidget);

      await _tap(tester, find.text('Open'));
      expect(repo.listCalls.last.activeOnly, isTrue);
      expect(find.text('No open requests'), findsOneWidget);
    });
  });

  group('request details', () {
    testWidgets('shows the device, the problem, what happens next and the history', (tester) async {
      final repo = FakeRequestRepository(current: sampleRequest(status: 'diagnosis_in_progress'));
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);

      expect(find.text('Old Samsung phone'), findsOneWidget);
      expect(find.text('Being checked'), findsWidgets);
      expect(find.text('Screen is cracked'), findsWidgets);
      expect(find.textContaining('will send you a quote'), findsOneWidget);
      expect(find.text('History'), findsOneWidget);
    });

    testWidgets('says how the repair is done, the same at every step', (tester) async {
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), FakeRequestRepository(current: sampleRequest(status: 'technician_assigned')));
      expect(find.text('Collected and returned'), findsOneWidget);
    });

    testWidgets('an on-site repair says it happens at your place', (tester) async {
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), FakeRequestRepository(current: sampleRequest(status: 'repair_in_progress', onSite: true)));
      expect(find.text('At your place'), findsOneWidget);
    });

    testWidgets('a quote is shown with its lines, and approving it asks first', (tester) async {
      final repo = FakeRequestRepository(
        current: sampleRequest(status: 'customer_approval_pending', actions: ['approve_quotation', 'reject_quotation', 'cancel'], quote: true),
      )..result = sampleRequest(status: 'repair_in_progress');
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);

      expect(find.text('Quote to review'), findsOneWidget);
      expect(find.text('₹2,500'), findsWidgets);
      expect(find.text('Screen'), findsOneWidget);
      expect(find.text('Labour'), findsOneWidget);
      expect(find.text('Revised (v2)'), findsOneWidget);

      await _tap(tester, find.text('Approve ₹2,500'));
      expect(find.text('Approve this quote?'), findsOneWidget);
      expect(repo.calls, isEmpty); // nothing happens until the dialog is confirmed

      await _tap(tester, _inDialog('Approve ₹2,500'));
      expect(repo.calls, ['approve:q1::again']);
      expect(find.text('Repair in progress'), findsWidgets);
    });

    testWidgets('backing out of the approval dialog changes nothing', (tester) async {
      final repo = FakeRequestRepository(current: sampleRequest(status: 'customer_approval_pending', actions: ['approve_quotation'], quote: true));
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);

      await _tap(tester, find.text('Approve ₹2,500'));
      await _tap(tester, _inDialog('Not now'));
      expect(repo.calls, isEmpty);
    });

    testWidgets('declining a quote needs a reason, and can cancel the request', (tester) async {
      final repo = FakeRequestRepository(
        current: sampleRequest(status: 'customer_approval_pending', actions: ['approve_quotation', 'reject_quotation'], quote: true),
      )..result = sampleRequest(status: 'cancelled');
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);

      await _tap(tester, find.text('Decline quote'));
      await _tap(tester, _inDialog('Decline'));
      expect(find.text('Please give a short reason'), findsOneWidget);
      expect(repo.calls, isEmpty);

      await tester.enterText(find.descendant(of: find.byType(AlertDialog), matching: find.byType(TextField)), 'Too costly');
      await _tap(tester, find.byType(CheckboxListTile));
      await _tap(tester, _inDialog('Decline'));

      expect(repo.calls, ['decline:q1:Too costly:cancel']);
      expect(find.text('Cancelled'), findsWidgets);
    });

    testWidgets('handing the device over needs the data-protection checklist ticked', (tester) async {
      final repo = FakeRequestRepository(current: sampleRequest(status: 'device_collection_pending', actions: ['schedule_pickup', 'confirm_handover']));
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);

      expect(find.text('Handing over your device'), findsOneWidget);
      await _tap(tester, find.text('Confirm handover'));
      expect(find.text('Before you hand it over'), findsOneWidget);

      final confirm = find.widgetWithText(FilledButton, 'Confirm handover');
      expect(tester.widget<FilledButton>(confirm.last).onPressed, isNull); // disabled until ticked

      await _tap(tester, find.byType(CheckboxListTile));
      await _tap(tester, confirm.last);
      expect(repo.calls, ['handover:checklist']);
    });

    testWidgets('the server refusing an action is shown on the page', (tester) async {
      final repo = FakeRequestRepository(current: sampleRequest(status: 'device_delivered', actions: ['confirm_completion']))
        ..actionError = const ApiException('The customer has not approved a quotation yet', failure: ApiFailure.conflict, statusCode: 422);
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);

      await _tap(tester, find.text('Confirm repair is done'));
      await _tap(tester, _inDialog('Yes, it is done'));
      expect(find.text('The customer has not approved a quotation yet'), findsOneWidget);
    });

    testWidgets('the repair photos show under their history step and open larger', (tester) async {
      final semantics = tester.ensureSemantics();
      final json = requestJson(status: 'repair_completed');
      json['statusHistory'] = <Object?>[...(json['statusHistory'] as List), {
        'status': 'repair_completed',
        'at': '2026-11-16T10:00:00.000Z',
        'note': 'Screen replaced and tested',
        'photos': [
          {'url': '/uploads/repair/done1.jpg'},
          {'url': '/uploads/repair/done2.jpg'},
        ],
      }];
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), FakeRequestRepository(current: ServiceRequest.fromJson(json)));

      final thumbs = find.byWidgetPredicate((w) => w is ListingPhotoView && w.semanticLabel == 'Repair photo');
      expect(thumbs, findsNWidgets(2));
      expect(find.bySemanticsLabel(RegExp('Screen replaced and tested\\. 2 photos\\.')), findsOneWidget);

      await _tap(tester, thumbs.first);
      expect(find.byType(InteractiveViewer), findsOneWidget);
      await _tap(tester, find.byTooltip('Close'));
      expect(find.byType(InteractiveViewer), findsNothing);
      semantics.dispose();
    });

    testWidgets('the technician\'s updates show newest first, with their photos', (tester) async {
      final json = requestJson(status: 'repair_in_progress')
        ..['repairNotes'] = [
          {'text': 'Battery ordered', 'at': '2026-11-16T09:00:00.000Z'},
          {'text': 'Battery fitted, testing', 'at': '2026-11-16T12:00:00.000Z'},
        ]
        ..['progressPhotos'] = [
          {'url': '/uploads/service/p1.jpg'},
          {'url': '/uploads/service/p2.jpg'},
        ];
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), FakeRequestRepository(current: ServiceRequest.fromJson(json)));

      expect(find.text('Repair updates'), findsOneWidget);
      final newest = tester.getTopLeft(find.text('Battery fitted, testing')).dy;
      final oldest = tester.getTopLeft(find.text('Battery ordered')).dy;
      expect(newest, lessThan(oldest));
      expect(find.byWidgetPredicate((w) => w is ListingPhotoView && w.semanticLabel == 'Repair photo'), findsNWidgets(2));
    });

    testWidgets('shows when the device comes back, in the facts and the hint', (tester) async {
      final json = requestJson(status: 'device_delivery_pending', actions: ['confirm_handover'])
        ..['returnSchedule'] = {'date': '2026-11-18T11:30:00.000Z', 'timeSlot': '5 pm - 7 pm'};
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), FakeRequestRepository(current: ServiceRequest.fromJson(json)));

      expect(find.text('Return'), findsOneWidget);
      expect(find.textContaining('5 pm - 7 pm'), findsOneWidget);
      expect(find.textContaining('Expect it back on'), findsOneWidget);
    });

    testWidgets('a long technician name in the handover card wraps instead of overflowing on a small phone', (tester) async {
      final json = requestJson(status: 'device_delivery_pending', actions: ['confirm_handover'])
        ..['technician'] = {'_id': 't1', 'name': 'A technician with a very long business name indeed'};
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), FakeRequestRepository(current: ServiceRequest.fromJson(json)));
      tester.view.physicalSize = const Size(320, 2400);
      await tester.pump(const Duration(milliseconds: 100));

      expect(find.textContaining('has not confirmed yet'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });

    testWidgets('no return time yet, no Return row', (tester) async {
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), FakeRequestRepository(current: sampleRequest(status: 'device_delivery_pending', actions: ['confirm_handover'])));
      expect(find.text('Return'), findsNothing);
      expect(find.text('Confirm the handover when you have your device back.'), findsOneWidget);
    });

    testWidgets('cancelling while the technician has the device says it must come back', (tester) async {
      Map<String, dynamic> held(String status, List<String> actions) => requestJson(status: status, actions: actions)
        ..['handover'] = {
          'collect': {'owner': true, 'provider': true, 'checklistAcknowledged': true},
          'delivery': {'owner': false, 'provider': false},
        };
      final repo = FakeRequestRepository(current: ServiceRequest.fromJson(held('diagnosis_in_progress', ['cancel'])))
        ..result = ServiceRequest.fromJson(held('cancelled', []));
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);

      await _tap(tester, find.text('Cancel request'));
      expect(find.textContaining('Ravi Kumar still has your device'), findsOneWidget);
      await _tap(tester, _inDialog('Cancel request'));
      expect(find.textContaining('still has your device and has been asked to return it'), findsOneWidget);
    });

    testWidgets('grouped updates keep each photo under its own note', (tester) async {
      final json = requestJson(status: 'repair_in_progress')
        ..['progressUpdates'] = [
          {'text': 'Battery ordered', 'photos': [{'url': '/u/a.jpg'}], 'at': '2026-11-16T09:00:00.000Z'},
          {'text': 'Battery fitted, testing', 'photos': <Object>[], 'at': '2026-11-16T12:00:00.000Z'},
        ];
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), FakeRequestRepository(current: ServiceRequest.fromJson(json)));

      final photo = find.byWidgetPredicate((w) => w is ListingPhotoView && w.semanticLabel == 'Repair photo');
      expect(photo, findsOneWidget);
      final newest = tester.getTopLeft(find.text('Battery fitted, testing')).dy;
      final oldest = tester.getTopLeft(find.text('Battery ordered')).dy;
      final photoTop = tester.getTopLeft(photo).dy;
      expect(newest, lessThan(oldest)); // newest first
      expect(photoTop, greaterThan(oldest)); // the photo sits under the note it came with
    });

    testWidgets('a completed request can be reviewed; the overall stars are required', (tester) async {
      final semantics = tester.ensureSemantics();
      final repo = FakeRequestRepository(current: sampleRequest(status: 'service_completed', actions: ['review']))
        ..result = sampleRequest(status: 'service_completed');
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);

      await _tap(tester, find.text('Review Ravi Kumar'));
      expect(find.text('How did Ravi Kumar do?'), findsOneWidget);
      await _tap(tester, find.text('Send review'));
      expect(find.text('Choose a star rating.'), findsOneWidget);
      expect(repo.calls, isEmpty);

      await _tap(tester, find.bySemanticsLabel('Overall rating, 4 stars'));
      await _tap(tester, find.bySemanticsLabel('Timeliness, 5 stars'));
      await tester.enterText(find.widgetWithText(TextField, 'Your review (optional)'), 'Quick and careful');
      await _tap(tester, find.text('Send review'));

      expect(repo.calls, ['review:{rating: 4, timeliness: 5, comment: Quick and careful}']);
      expect(find.text('Thank you for your review'), findsOneWidget);
      expect(find.text('Review Ravi Kumar'), findsNothing); // the button goes once it is reviewed
      semantics.dispose();
    });

    testWidgets('no updates, no updates card', (tester) async {
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), FakeRequestRepository(current: sampleRequest(status: 'repair_in_progress')));
      expect(find.text('Repair updates'), findsNothing);
    });

    testWidgets('cancelling asks for an optional reason and shows the result', (tester) async {
      final repo = FakeRequestRepository(current: sampleRequest(status: 'request_submitted', actions: ['cancel']))..result = sampleRequest(status: 'cancelled');
      await _pump(tester, const RequestDetailsScreen(id: 'r1'), repo);

      await _tap(tester, find.text('Cancel request'));
      await _tap(tester, _inDialog('Cancel request'));
      expect(repo.calls, ['cancel:']);
      expect(find.text('Cancelled'), findsWidgets);
      expect(find.text('Cancel request'), findsNothing); // the button is gone once it is cancelled
    });
  });

  test('nextStepHint tells an on-site request from a collected one', () {
    expect(nextStepHint(sampleRequest(status: 'technician_assigned', onSite: true)), contains('come and check'));
    expect(nextStepHint(sampleRequest(status: 'technician_assigned')), contains('pickup time'));
  });
}
