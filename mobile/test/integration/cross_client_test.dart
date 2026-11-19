// Web <-> mobile shared-data check, driven by backend/scripts/crossClientWeb.js (the web side). The mobile side runs here:
//   flutter test test/integration/cross_client_test.dart --dart-define=LIVE_API=http://localhost:5055/api \
//     --dart-define=WEB_TITLE="Web-made X" --dart-define=MOBILE_TITLE="Mobile-made X"
// It needs the demo data from `npm run seed`; skipped without LIVE_API.
import 'dart:convert';
import 'dart:io';

import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/models/listing_input.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/auth_repository.dart';
import 'package:ewaste_opportunity/services/device_repository.dart';
import 'package:ewaste_opportunity/services/photo_picker.dart';
import 'package:flutter_test/flutter_test.dart';

const _api = String.fromEnvironment('LIVE_API');
const _webTitle = String.fromEnvironment('WEB_TITLE');
const _mobileTitle = String.fromEnvironment('MOBILE_TITLE');
final _skip = (_api.isEmpty || _webTitle.isEmpty || _mobileTitle.isEmpty)
    ? 'Set LIVE_API, WEB_TITLE and MOBILE_TITLE to run'
    : null;

void main() {
  test('mobile sees what web created, and creates something web can see', () async {
    final client = ApiClient(store: MemoryKeyValueStore(), baseUrl: _api);
    await AuthRepository(client).login(email: 'user@demo.local', password: 'Demo@12345');
    final devices = DeviceRepository(client);

    final mine = await devices.list(const ListingQuery(mine: true, limit: 50));
    expect(mine.items.map((l) => l.title), contains(_webTitle), reason: 'mobile must see the listing the web app created');
    // ignore: avoid_print
    print('MOBILE sees "$_webTitle" created by web');

    final file = File('${Directory.systemTemp.path}/xclient_mobile.png')
      ..writeAsBytesSync(base64Decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='));
    final created = await devices.create(
      const ListingInput(
        name: _mobileTitle, category: 'laptop', condition: 'fully_working', preferredService: 'reuse', brand: 'MobBrand',
        model: 'M1', modelYear: '2020', purchaseYear: '2021', pickupPreference: 'either', addressArea: 'Indiranagar',
        city: 'Bengaluru', agentPhone: '9876543210',
      ),
      [PickedPhoto(path: file.path, name: 'mobile.png', mime: 'image/png', bytes: file.lengthSync())],
    );
    // ignore: avoid_print
    print('MOBILE created "${created.title}" (id ${created.id})');
  }, skip: _skip);
}
