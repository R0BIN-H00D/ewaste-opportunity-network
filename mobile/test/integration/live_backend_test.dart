// Checks the app's own code against a REAL running backend (P7-18): it signs in, then reads one of everything with the same
// repositories and models the screens use, so a change on the server that the app does not understand fails here instead of
// on someone's phone. It only runs when told where the backend is:
//
//   flutter test test/integration --dart-define=LIVE_API=http://localhost:5000/api
//
// It needs the demo data from `npm run seed` (user@demo.local / Demo@12345) and changes nothing: every call is a read, except
// signing in. Without LIVE_API every test here is skipped, so the normal `flutter test` never needs a server.
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/services/account_repository.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/article_repository.dart';
import 'package:ewaste_opportunity/services/auth_repository.dart';
import 'package:ewaste_opportunity/services/chat_repository.dart';
import 'package:ewaste_opportunity/services/device_repository.dart';
import 'package:ewaste_opportunity/services/donation_repository.dart';
import 'package:ewaste_opportunity/services/impact_repository.dart';
import 'package:ewaste_opportunity/services/marketplace_repository.dart';
import 'package:ewaste_opportunity/services/pickup_repository.dart';
import 'package:ewaste_opportunity/services/recycling_repository.dart';
import 'package:ewaste_opportunity/services/request_repository.dart';
import 'package:ewaste_opportunity/services/technician_repository.dart';
import 'package:flutter_test/flutter_test.dart';

const _api = String.fromEnvironment('LIVE_API');
final _skip = _api.isEmpty
    ? 'Set --dart-define=LIVE_API=http://localhost:5000/api to run against a live backend'
    : null;

ApiClient _client() => ApiClient(store: MemoryKeyValueStore(), baseUrl: _api);

Future<ApiClient> _signedIn() async {
  final client = _client();
  await AuthRepository(client)
      .login(email: 'user@demo.local', password: 'Demo@12345');
  return client;
}

void main() {
  group('against the live backend', () {
    test('signing in works, and a wrong password is refused in words',
        () async {
      final client = _client();
      final me = await AuthRepository(client)
          .login(email: 'user@demo.local', password: 'Demo@12345');
      expect(me.user.email, 'user@demo.local');
      expect(client.hasAccessToken, isTrue);
      await expectLater(
        AuthRepository(_client())
            .login(email: 'user@demo.local', password: 'wrong-password'),
        throwsA(isA<ApiException>()
            .having((e) => e.message, 'message', isNotEmpty)),
      );
    }, skip: _skip);

    test('the shared lists and details read into the app models', () async {
      final client = await _signedIn();
      final devices = DeviceRepository(client);
      final categories = await devices.categories();
      expect(categories, isNotEmpty);
      final page = await devices.list(const ListingQuery(mine: true));
      expect(page.total, greaterThanOrEqualTo(0));
      if (page.items.isNotEmpty) {
        final one = await devices.get(page.items.first.id);
        expect(one.title, isNotEmpty);
      }
      expect(
          (await TechnicianRepository(client).list(const TechnicianQuery()))
              .items,
          isA<List<Object>>());
      expect(
          (await RecyclingRepository(client).centers(const CenterQuery()))
              .items,
          isA<List<Object>>());
      expect(
          (await MarketplaceRepository(client).products(const ProductQuery()))
              .items,
          isA<List<Object>>());
      expect(
          (await DonationRepository(client).donations(const DonationQuery()))
              .items,
          isA<List<Object>>());
    }, skip: _skip);

    test('a person\'s own work reads into the app models', () async {
      final client = await _signedIn();
      expect(
          (await RequestRepository(client).list()).items, isA<List<Object>>());
      expect((await MarketplaceRepository(client).orders()).items,
          isA<List<Object>>());
      expect((await RecyclingRepository(client).list()).items,
          isA<List<Object>>());
      final pickups = PickupRepository(client);
      expect((await pickups.list()).items, isA<List<Object>>());
      expect((await pickups.list(upcoming: false)).items, isA<List<Object>>());
      final slots = await pickups.slots();
      expect(slots.days, isNotEmpty);
      expect(slots.days.first.slots, hasLength(5));
      final account = AccountRepository(client);
      final notes = await account.notifications();
      expect(notes.unread, greaterThanOrEqualTo(0));
      final chat = ChatRepository(client);
      expect(await chat.unread(), greaterThanOrEqualTo(0));
      expect((await chat.conversations()).page.items, isA<List<Object>>());
    }, skip: _skip);

    test('the impact views read into the app models and agree with each other',
        () async {
      final client = await _signedIn();
      final impact = ImpactRepository(client);
      final summary = await impact.summary();
      final years = await impact.yearly();
      final kinds = await impact.byCategory();
      final months = await impact.monthly();
      expect(months, hasLength(12));
      expect(years, hasLength(5));
      // Every device is counted once in each view of the same events (the last twelve months can only hold part of the years).
      final inKinds = kinds.fold<int>(0, (t, r) => t + r.devices);
      expect(inKinds, summary.devicesTotal);
      expect(years.fold<int>(0, (t, r) => t + r.devices),
          lessThanOrEqualTo(summary.devicesTotal));
    }, skip: _skip);

    test('the learning centre and the sign-in-free reads work', () async {
      final articles = ArticleRepository(_client());
      final list = await articles.list();
      expect(list.items, isNotEmpty);
      final one = await articles.get(list.items.first.slug);
      expect(one.body, isNotEmpty);
      await expectLater(
          articles.get('no-such-guide-here'),
          throwsA(isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 404)));
    }, skip: _skip);

    test('a protected call without signing in is refused, not left hanging',
        () async {
      await expectLater(
          PickupRepository(_client()).list(),
          throwsA(isA<ApiException>()
              .having((e) => e.statusCode, 'statusCode', 401)));
    }, skip: _skip);
  });
}
