import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/pickup.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/pickup_providers.dart';
import 'package:ewaste_opportunity/routes/route_paths.dart';
import 'package:ewaste_opportunity/screens/pickups/pickups_screen.dart';
import 'package:ewaste_opportunity/screens/pickups/slot_sheet.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/pickup_repository.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart';
import '../helpers.dart';

class _Adapter implements HttpClientAdapter {
  final requests = <RequestOptions>[];
  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options);
    final body = options.path == '/pickups/slots'
        ? {'success': true, 'data': {'days': [slotDayJson('2026-11-18')], 'cutoffHours': 2, 'maxReschedules': 3}}
        : {'success': true, 'data': [pickupJson()], 'meta': {'page': 1, 'pages': 2, 'total': 21}};
    return ResponseBody.fromString(jsonEncode(body), 200, headers: {Headers.contentTypeHeader: [Headers.jsonContentType]});
  }

  @override
  void close({bool force = false}) {}
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<ProviderContainer> _pump(WidgetTester tester, Widget screen, FakePickupRepository repo, {double scale = 1}) async {
  tester.view.physicalSize = const Size(380, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, __) => Scaffold(body: screen)),
    GoRoute(path: Routes.request('ctx-pk1'), builder: (_, __) => const Scaffold(body: Text('REQUEST PAGE'))),
  ]);
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository(loginResult: sampleMe())),
        pickupRepositoryProvider.overrideWithValue(repo),
      ],
      child: MaterialApp.router(
        theme: AppTheme.light(),
        routerConfig: router,
        builder: (context, child) => MediaQuery(data: MediaQuery.of(context).copyWith(textScaler: TextScaler.linear(scale)), child: child!),
      ),
    ),
  );
  final container = ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
  await container.read(authControllerProvider.notifier).signIn(email: 'asha@example.com', password: 'x');
  await _settle(tester);
  return container;
}

/// A page with one button that opens the slot sheet and shows what it returned.
class _Opener extends StatefulWidget {
  const _Opener();
  @override
  State<_Opener> createState() => _OpenerState();
}

class _OpenerState extends State<_Opener> {
  String result = 'nothing yet';
  @override
  Widget build(BuildContext context) => Column(children: [
        TextButton(
          onPressed: () async {
            final c = await pickPickupSlot(context);
            setState(() => result = c == null ? 'backed out' : '${c.date.toIso8601String()} ${c.slot}');
          },
          child: const Text('Open'),
        ),
        Text(result),
      ]);
}

void main() {
  group('the models', () {
    test('a window says its hours the way people do', () {
      PickupSlot s(String key) => PickupSlot(key: key, label: '', start: DateTime(2026), available: true);
      expect(s('08:00-10:00').hours, '8-10 am');
      expect(s('10:00-12:00').hours, '10 am-12 pm');
      expect(s('12:00-14:00').hours, '12-2 pm');
      expect(s('16:00-18:00').hours, '4-6 pm');
      expect(s('11:00-13:00').hours, '11 am-1 pm');
      expect(s('nonsense').hours, 'nonsense');
    });

    test('reads the catalogue and the closed reasons', () {
      final c = SlotCatalogue.fromJson({'days': [slotDayJson('2026-11-18', open: {2, 3}, busy: {3})], 'cutoffHours': 2, 'maxReschedules': 3});
      final day = c.days.single;
      expect(day.date, '2026-11-18');
      expect(day.slots.map((s) => s.available), [false, false, true, false, false]);
      expect(day.slots[0].reason, 'too_soon');
      expect(day.slots[3].reason, 'busy');
      expect(day.hasOpen, isTrue);
      expect(c.cutoffHours, 2);
    });

    test('reads a pickup, and copes with missing parts', () {
      final p = PickupItem.fromJson(pickupJson(kind: 'donation', viewer: 'provider', count: 2));
      expect(p.kind, 'donation');
      expect(p.asRequester, isFalse);
      expect(p.reschedulesLeft, 1);
      expect(p.counterpartName, 'Ravi Kumar');
      final bare = PickupItem.fromJson({'_id': 'x'});
      expect(bare.title, 'Pickup');
      expect(bare.date, isNull);
      expect(bare.canChange, isFalse);
    });
  });

  group('the repository', () {
    test('asks for the windows and for one page of upcoming or past pickups', () async {
      final api = _Adapter();
      final client = ApiClient(store: MemoryKeyValueStore(), dio: Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = api, refreshDio: Dio(BaseOptions(baseUrl: 'http://test/api')));
      final repo = PickupRepository(client);
      expect((await repo.slots()).days.single.slots, hasLength(5));
      final page = await repo.list(upcoming: false, page: 2);
      expect(page.total, 21);
      expect(page.pages, 2);
      expect(api.requests[0].path, '/pickups/slots');
      expect(api.requests[1].path, '/pickups');
      expect(api.requests[1].queryParameters, {'when': 'past', 'page': 2, 'limit': 20});
    });
  });

  group('the day label', () {
    final today = DateTime(2026, 11, 17);
    test('says Today, Tomorrow, then the weekday and date', () {
      expect(slotDayLabel('2026-11-17', today: today), 'Today');
      expect(slotDayLabel('2026-11-18', today: today), 'Tomorrow');
      expect(slotDayLabel('2026-11-20', today: today), 'Fri 20 Nov');
      expect(slotDayLabel('junk', today: today), 'junk');
    });
  });

  group('choosing a window', () {
    testWidgets('lists the days that have room, and only an open window can be chosen', (tester) async {
      await _pump(tester, const _Opener(), FakePickupRepository(days: [slotDayJson('2026-11-18', open: {}), slotDayJson('2026-11-19', open: {1, 2, 3, 4}, busy: {1})]));
      await tester.tap(find.text('Open'));
      await _settle(tester);
      expect(find.text('Choose a time'), findsOneWidget);
      expect(find.textContaining('until 2 hours before'), findsOneWidget);
      // The day with nothing open is not offered; the other one is selected.
      expect(find.textContaining('Thu 19 Nov'), findsOneWidget);
      expect(find.textContaining('Wed 18 Nov'), findsNothing);
      // The button waits for a window.
      FilledButton button() => tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Use this time'));
      expect(button().onPressed, isNull);
      // A closed window cannot be chosen.
      await tester.tap(find.textContaining('Late morning'));
      await _settle(tester);
      expect(button().onPressed, isNull);
    });

    testWidgets('returns the window start and its key', (tester) async {
      await _pump(tester, const _Opener(), FakePickupRepository());
      await tester.tap(find.text('Open'));
      await _settle(tester);
      await tester.tap(find.textContaining('Afternoon'));
      await _settle(tester);
      await tester.tap(find.text('Use this time'));
      await _settle(tester);
      expect(find.textContaining('14:00-16:00'), findsOneWidget);
      expect(find.textContaining('2026-11-18T08:30:00.000Z'), findsOneWidget); // 14:00 IST is 08:30 UTC
    });

    testWidgets('changing the day clears the window that was chosen', (tester) async {
      await _pump(tester, const _Opener(), FakePickupRepository());
      await tester.tap(find.text('Open'));
      await _settle(tester);
      await tester.tap(find.textContaining('Afternoon'));
      await _settle(tester);
      await tester.tap(find.textContaining('Thu 19 Nov'));
      await _settle(tester);
      expect(tester.widget<FilledButton>(find.widgetWithText(FilledButton, 'Use this time')).onPressed, isNull);
    });

    testWidgets('says why it cannot load, and offers the windows again on retry', (tester) async {
      final repo = FakePickupRepository()..slotsError = const ApiException('Cannot reach the server', failure: ApiFailure.network);
      await _pump(tester, const _Opener(), repo);
      await tester.tap(find.text('Open'));
      await _settle(tester);
      expect(find.text('Cannot reach the server'), findsOneWidget);
      expect(find.text('Pick a time myself'), findsOneWidget);
      repo.slotsError = null;
      await tester.tap(find.text('Try again'));
      await _settle(tester);
      expect(find.text('Use this time'), findsOneWidget);
    });

    testWidgets('says so when nothing is open', (tester) async {
      await _pump(tester, const _Opener(), FakePickupRepository(days: [slotDayJson('2026-11-18', open: {})]));
      await tester.tap(find.text('Open'));
      await _settle(tester);
      expect(find.text('No times are open in the next two weeks.'), findsOneWidget);
    });

    testWidgets('fits on a small phone at the largest text size', (tester) async {
      await _pump(tester, const _Opener(), FakePickupRepository(), scale: 2);
      await tester.tap(find.text('Open'));
      await _settle(tester);
      expect(tester.takeException(), isNull);
    });
  });

  group('the Pickups screen', () {
    testWidgets('shows what is coming, with who it is with, where, and how much can still change', (tester) async {
      await _pump(tester, const PickupsScreen(), FakePickupRepository());
      expect(find.text('Dell Inspiron'), findsOneWidget);
      expect(find.text('Confirmed'), findsOneWidget);
      expect(find.text('Repair · with Ravi Kumar'), findsOneWidget);
      expect(find.text('Indiranagar'), findsOneWidget);
      expect(find.textContaining('10:00-12:00'), findsOneWidget);
      expect(find.textContaining('Can be changed 3 more times, until'), findsOneWidget);
    });

    testWidgets('says "once more" with one change left, and why a pickup cannot be changed', (tester) async {
      final repo = FakePickupRepository(upcoming: [
        pickupJson(id: 'a', title: 'One left', count: 2),
        pickupJson(id: 'b', title: 'Used up', count: 3, canChange: false),
        pickupJson(id: 'c', title: 'Too close', canChange: false),
      ]);
      await _pump(tester, const PickupsScreen(), repo);
      expect(find.textContaining('Can be changed once more'), findsOneWidget);
      expect(find.text('Cannot be changed again'), findsOneWidget);
      expect(find.text('Too close to the start to change'), findsOneWidget);
    });

    testWidgets('words it for the other side of the pickup', (tester) async {
      await _pump(tester, const PickupsScreen(), FakePickupRepository(upcoming: [pickupJson(kind: 'recycling', viewer: 'provider')]));
      expect(find.text('Recycling · for Ravi Kumar'), findsOneWidget);
    });

    testWidgets('switches to past ones, which carry no change note', (tester) async {
      final repo = FakePickupRepository(past: [pickupJson(id: 'old', title: 'Old laptop', status: 'collected', date: DateTime.now().subtract(const Duration(days: 5)))]);
      await _pump(tester, const PickupsScreen(), repo);
      await tester.tap(find.text('Past'));
      await _settle(tester);
      expect(repo.asked, contains(false));
      expect(find.text('Old laptop'), findsOneWidget);
      expect(find.text('Handed over'), findsOneWidget);
      expect(find.textContaining('Can be changed'), findsNothing);
    });

    testWidgets('calls an arranged pickup whose time has gone "Time passed"', (tester) async {
      final p = PickupItem.fromJson(pickupJson(date: DateTime.now().subtract(const Duration(hours: 3))));
      expect(pickupStatusLabel(p), 'Time passed');
      expect(pickupStatusLabel(PickupItem.fromJson(pickupJson(status: 'requested'))), 'Waiting');
      expect(pickupStatusLabel(PickupItem.fromJson(pickupJson(status: 'rescheduled'))), 'Moved');
      expect(pickupStatusLabel(PickupItem.fromJson(pickupJson(status: 'cancelled'))), 'Cancelled');
    });

    testWidgets('opens the request behind a pickup', (tester) async {
      await _pump(tester, const PickupsScreen(), FakePickupRepository());
      await tester.tap(find.text('Dell Inspiron'));
      await _settle(tester);
      expect(find.text('REQUEST PAGE'), findsOneWidget);
    });

    testWidgets('sends each kind to its own screen', (tester) async {
      PickupItem p(String kind) => PickupItem.fromJson(pickupJson(kind: kind));
      expect(pickupRoute(p('repair')), Routes.request('ctx-pk1'));
      expect(pickupRoute(p('donation')), Routes.donation('ctx-pk1'));
      expect(pickupRoute(p('refurbishment')), Routes.refurbJob('ctx-pk1'));
      expect(pickupRoute(p('recycling')), Routes.recyclingRequest('ctx-pk1'));
    });

    testWidgets('has an honest empty state', (tester) async {
      await _pump(tester, const PickupsScreen(), FakePickupRepository(upcoming: const []));
      expect(find.text('Nothing coming up'), findsOneWidget);
    });

    testWidgets('says why it cannot load', (tester) async {
      final bad = FakePickupRepository()..listError = const ApiException('Cannot reach the server', failure: ApiFailure.network);
      await _pump(tester, const PickupsScreen(), bad);
      expect(find.textContaining('Cannot reach the server'), findsWidgets);
    });

    testWidgets('fits at the largest text size', (tester) async {
      await _pump(tester, const PickupsScreen(), FakePickupRepository(), scale: 2);
      expect(tester.takeException(), isNull);
    });
  });

  group('confirming a time (FR-PICK-002)', () {
    testWidgets('asks the person to confirm a time the other side set, and confirms it', (tester) async {
      final repo = FakePickupRepository(upcoming: [pickupJson(status: 'rescheduled', awaitingMe: true)]);
      await _pump(tester, const PickupsScreen(), repo);
      expect(find.textContaining('Ravi Kumar suggested this time'), findsOneWidget);
      await tester.ensureVisible(find.text('Confirm this time'));
      await tester.tap(find.text('Confirm this time'));
      await _settle(tester);
      expect(repo.confirmed, ['pk1']);
      expect(find.text('Confirm this time'), findsNothing); // the list was fetched again and it is settled
      expect(find.text('Confirmed'), findsOneWidget);
      expect(find.text('Time confirmed'), findsOneWidget);
    });

    testWidgets('says the person is waiting when they suggested the time, with no button', (tester) async {
      final repo = FakePickupRepository(upcoming: [pickupJson(status: 'rescheduled', proposedByMe: true)]);
      await _pump(tester, const PickupsScreen(), repo);
      expect(find.text('Waiting for Ravi Kumar to confirm this time.'), findsOneWidget);
      expect(find.text('Confirm this time'), findsNothing);
    });

    testWidgets('shows nothing extra for a settled time', (tester) async {
      await _pump(tester, const PickupsScreen(), FakePickupRepository());
      expect(find.text('Confirm this time'), findsNothing);
      expect(find.textContaining('Waiting for'), findsNothing);
    });

    testWidgets('says why a confirmation failed and keeps the button', (tester) async {
      final repo = FakePickupRepository(upcoming: [pickupJson(status: 'rescheduled', awaitingMe: true)])..confirmError = const ApiException('This time has already passed', failure: ApiFailure.conflict, statusCode: 409);
      await _pump(tester, const PickupsScreen(), repo);
      await tester.ensureVisible(find.text('Confirm this time'));
      await tester.tap(find.text('Confirm this time'));
      await _settle(tester);
      expect(find.text('This time has already passed'), findsOneWidget);
      expect(find.text('Confirm this time'), findsOneWidget);
    });

    testWidgets('fits at the largest text size', (tester) async {
      await _pump(tester, const PickupsScreen(), FakePickupRepository(upcoming: [pickupJson(status: 'rescheduled', awaitingMe: true)]), scale: 2);
      expect(tester.takeException(), isNull);
    });
  });}
