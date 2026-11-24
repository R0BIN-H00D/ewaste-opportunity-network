import 'package:ewaste_opportunity/models/geo_place.dart';
import 'package:ewaste_opportunity/services/location_service.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/user.dart';
import 'package:ewaste_opportunity/models/wanted.dart';
import 'package:ewaste_opportunity/providers/auth_controller.dart';
import 'package:ewaste_opportunity/providers/core_providers.dart';
import 'package:ewaste_opportunity/providers/location_providers.dart';
import 'package:ewaste_opportunity/providers/wanted_providers.dart';
import 'package:ewaste_opportunity/screens/wanted/wanted_screens.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/wanted_repository.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../fakes.dart' show FakeGeoRepository, FakeLocationService;
import '../helpers.dart';

class FakeWantedRepository extends WantedRepository {
  FakeWantedRepository({this.boardItems = const [], this.mineItems = const []}) : super(ApiClient(store: MemoryKeyValueStore()));

  List<WantedRequest> boardItems;
  List<WantedRequest> mineItems;
  final calls = <String>[];
  ApiException? respondError;

  @override
  Future<List<WantedRequest>> board() async => boardItems;

  @override
  Future<List<WantedRequest>> mine() async => mineItems;

  @override
  Future<void> respond(String id, {String? message}) async {
    final e = respondError;
    if (e != null) throw e;
    calls.add('respond:$id:${message ?? ''}');
  }

  @override
  Future<void> create({required String title, String? brand, String? minCondition, int quantity = 1, String? city, String? notes}) async {
    calls.add('create:$title:${brand ?? ''}:${minCondition ?? ''}:$quantity:${city ?? ''}');
  }

  @override
  Future<void> update(String id, {required String title, String? brand, String? minCondition, int quantity = 1, String? city, String? notes}) async {
    calls.add('update:$id:$title:${brand ?? ''}:${minCondition ?? ''}:$quantity:${city ?? ''}:${notes ?? ''}');
  }

  @override
  Future<void> setStatus(String id, String status) async => calls.add('status:$id:$status');

  @override
  Future<void> delete(String id) async => calls.add('delete:$id');

  @override
  Future<List<WantedResponse>> responses(String id) async => const [WantedResponse(id: 'r1', name: 'Meera Iyer', role: 'user', message: 'I have two')];
}

const _laptops = WantedRequest(id: 'w1', title: 'Used laptops', categoryName: 'Laptops', quantity: 3, minCondition: 'minor_damage', city: 'Bengaluru', refurbisherName: 'Green Tech');

Future<void> _pump(WidgetTester tester, FakeWantedRepository repo, UserRole role, {FakeLocationService? phone, FakeGeoRepository? geo}) async {
  tester.view.physicalSize = const Size(900, 2400);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(routes: [
    GoRoute(path: '/', builder: (_, __) => const WantedPage()),
    GoRoute(path: '/wanted/:id/accept', builder: (_, state) => WantedAcceptScreen(request: state.extra! as WantedRequest)),
  ]);
  addTearDown(router.dispose);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        keyValueStoreProvider.overrideWithValue(MemoryKeyValueStore()),
        authRepositoryProvider.overrideWithValue(FakeAuthRepository(loginResult: sampleMe(role: role))),
        wantedRepositoryProvider.overrideWithValue(repo),
        if (phone != null) locationServiceProvider.overrideWithValue(phone),
        if (geo != null) geoRepositoryProvider.overrideWithValue(geo),
      ],
      child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
    ),
  );
  final container = ProviderScope.containerOf(tester.element(find.byType(MaterialApp)));
  await container.read(authControllerProvider.notifier).signIn(email: 'a@b.c', password: 'x');
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> _tap(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  testWidgets('an owner sees what refurbishers want and accepts one with a message', (tester) async {
    final repo = FakeWantedRepository(boardItems: const [_laptops]);
    await _pump(tester, repo, UserRole.user);
    expect(find.text('Wanted devices'), findsOneWidget);
    expect(find.text('Used laptops'), findsOneWidget);
    expect(find.textContaining('Wanted by Green Tech'), findsOneWidget);
    expect(find.text('New request'), findsNothing); // only refurbishers post requests

    await _tap(tester, find.widgetWithText(FilledButton, 'Accept'));
    // A page of its own, not a pop-up: the request in full, then the message.
    expect(find.byType(AlertDialog), findsNothing);
    expect(find.text('Accept this request'), findsWidgets);
    expect(find.text('Read what they are looking for, then tell them how you can help.'), findsOneWidget);
    expect(find.text('Qty 3'), findsOneWidget);
    await tester.enterText(find.widgetWithText(TextField, 'Your message (optional)'), 'I have two');
    await _tap(tester, find.widgetWithText(FilledButton, 'Accept this request'));
    expect(repo.calls, ['respond:w1:I have two']);
    expect(find.text('You accepted this request'), findsOneWidget);
  });

  testWidgets('the accept page starts the message from an idea', (tester) async {
    final repo = FakeWantedRepository(boardItems: const [_laptops]);
    await _pump(tester, repo, UserRole.user);
    await _tap(tester, find.widgetWithText(FilledButton, 'Accept'));
    await _tap(tester, find.text('I can give it for free.'));
    await _tap(tester, find.widgetWithText(FilledButton, 'Accept this request'));
    expect(repo.calls, ['respond:w1:I can give it for free.']);
  });

  testWidgets('a refurbisher can edit a request: the form starts filled in and saves with update', (tester) async {
    final repo = FakeWantedRepository(mineItems: const [WantedRequest(id: 'w1', title: 'Used laptops', brand: 'Dell', quantity: 3, city: 'Bengaluru', notes: 'Any model')]);
    await _pump(tester, repo, UserRole.refurbisher);
    await _tap(tester, find.text('Edit'));
    expect(find.text('Edit request'), findsOneWidget);
    expect(tester.widget<TextFormField>(find.widgetWithText(TextFormField, 'What are you looking for?')).controller!.text, 'Used laptops');
    await tester.enterText(find.widgetWithText(TextFormField, 'What are you looking for?'), 'Used ThinkPads');
    await tester.enterText(find.widgetWithText(TextFormField, 'How many?'), '8');
    await tester.enterText(find.widgetWithText(TextFormField, 'Brand (optional)'), '');
    await _tap(tester, find.text('Save changes'));
    expect(repo.calls, ['update:w1:Used ThinkPads:::8:Bengaluru:Any model']);
    expect(repo.calls.any((c) => c.startsWith('create')), isFalse);
  });

  testWidgets('a request already accepted shows as accepted, with no button', (tester) async {
    final repo = FakeWantedRepository(boardItems: const [WantedRequest(id: 'w1', title: 'Used laptops', hasResponded: true)]);
    await _pump(tester, repo, UserRole.technician);
    expect(find.text('Accepted'), findsOneWidget);
    expect(find.widgetWithText(FilledButton, 'Accept'), findsNothing);
  });

  testWidgets('a refurbisher can detect the city for a new request', (tester) async {
    await _pump(tester, FakeWantedRepository(), UserRole.refurbisher,
        phone: FakeLocationService.at(const GeoPoint(12.9716, 77.5946)),
        geo: FakeGeoRepository(place: const GeoPlace(area: 'Indiranagar', city: 'Bengaluru')));
    await _tap(tester, find.text('New request').first);
    await _tap(tester, find.text('Detect my current location'));
    expect(tester.widget<TextFormField>(find.widgetWithText(TextFormField, 'City (optional)')).controller!.text, 'Bengaluru');
  });

  testWidgets('says so when the server refuses an acceptance', (tester) async {
    final repo = FakeWantedRepository(boardItems: const [_laptops])..respondError = const ApiException('You have already accepted this request', code: 'ALREADY_RESPONDED');
    await _pump(tester, repo, UserRole.user);
    await _tap(tester, find.widgetWithText(FilledButton, 'Accept'));
    await _tap(tester, find.widgetWithText(FilledButton, 'Accept this request'));
    expect(find.text('You have already accepted this request'), findsOneWidget);
  });

  testWidgets('a refurbisher sees their own requests, who accepted them, and can message them', (tester) async {
    final repo = FakeWantedRepository(mineItems: const [WantedRequest(id: 'w1', title: 'Used laptops', quantity: 3, responseCount: 1)]);
    await _pump(tester, repo, UserRole.refurbisher);
    expect(find.text('My requests'), findsOneWidget);
    expect(find.text('New request'), findsOneWidget);
    expect(find.text('1 accepted'), findsOneWidget);

    await _tap(tester, find.text('1 accepted'));
    expect(find.textContaining('Meera Iyer (device owner)'), findsOneWidget);
    expect(find.text('I have two'), findsOneWidget);
    expect(find.text('Message'), findsOneWidget);

    await _tap(tester, find.text('Close'));
    await _tap(tester, find.text('Delete'));
    expect(repo.calls, ['status:w1:closed', 'delete:w1']);
  });

  testWidgets('a refurbisher adds a new request, and the form checks it first', (tester) async {
    final repo = FakeWantedRepository();
    await _pump(tester, repo, UserRole.refurbisher);
    expect(find.text('No requests yet'), findsOneWidget);

    await _tap(tester, find.text('New request').first);
    await _tap(tester, find.widgetWithText(FilledButton, 'Add request'));
    expect(find.textContaining('Say what you are looking for'), findsOneWidget);
    expect(repo.calls, isEmpty);

    await tester.enterText(find.widgetWithText(TextFormField, 'What are you looking for?'), 'Used laptops');
    await tester.enterText(find.widgetWithText(TextFormField, 'City (optional)'), 'Pune');
    await _tap(tester, find.text('Minor damage'));
    await _tap(tester, find.widgetWithText(FilledButton, 'Add request'));
    expect(repo.calls, ['create:Used laptops::minor_damage:1:Pune']);
  });
}
