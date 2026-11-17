import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/models/ai_suggestion.dart';
import 'package:ewaste_opportunity/models/listing_input.dart';
import 'package:ewaste_opportunity/services/ai_repository.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/photo_picker.dart';
import 'package:flutter_test/flutter_test.dart';
import '../fakes.dart';

class _Adapter implements HttpClientAdapter {
  _Adapter(this.respond);

  final ResponseBody Function() respond;
  final requests = <RequestOptions>[];

  @override
  Future<ResponseBody> fetch(RequestOptions options, Stream<Uint8List>? requestStream, Future<void>? cancelFuture) async {
    requests.add(options);
    return respond();
  }

  @override
  void close({bool force = false}) {}
}

ResponseBody _json(int status, Object body) => ResponseBody.fromString(jsonEncode(body), status, headers: {Headers.contentTypeHeader: [Headers.jsonContentType]});

void main() {
  group('AiSuggestion', () {
    test('reads the server answer', () {
      final s = AiSuggestion.fromJson(aiJson(source: 'gemini', usedPhoto: true, confidence: 0.82, reason: null, repairs: const ['Hinge check']));
      expect(s.categorySlug, 'laptops');
      expect(s.categoryName, 'Laptops');
      expect(s.brand, 'Dell');
      expect(s.usedPhoto, isTrue);
      expect(s.fallbackReason, isNull);
      expect(s.possibleRepairs, ['Hinge check']);
      expect(s.isEmpty, isFalse);
    });

    test('says how sure in words, never as a percentage', () {
      AiSuggestion at(double c) => AiSuggestion.fromJson(aiJson(confidence: c));
      expect(at(0.9).confidenceLabel, 'Fairly sure');
      expect(at(0.5).confidenceLabel, 'Not very sure');
      expect(at(0.2).confidenceLabel, 'Only a guess');
    });

    test('an answer with nothing in it is empty, and odd values do not break it', () {
      expect(AiSuggestion.fromJson(aiJson(category: null, brand: null, damage: const [])).isEmpty, isTrue);
      final odd = AiSuggestion.fromJson({'category': 'nonsense', 'visibleDamage': [1, '  ', ' Dent '], 'confidence': 'high'});
      expect(odd.categorySlug, isNull);
      expect(odd.visibleDamage, ['Dent']);
      expect(odd.confidence, 0);
      expect(odd.source, 'rules');
    });

    test('what is saved with a listing carries only what the server accepts', () {
      final saved = AiSuggestion.fromJson(aiJson(confidence: 0.6666)).toSaved();
      expect(saved.keys, unorderedEquals(['source', 'category', 'type', 'brand', 'visibleDamage', 'possibleRepairs', 'confidence']));
      expect(saved['confidence'], 0.67);
      expect(saved.containsKey('confirmedByUser'), isFalse); // the server decides that
    });
  });

  group('ListingInput', () {
    test('sends the accepted suggestion only when there is one', () {
      const base = ListingInput(name: 'Laptop', category: 'laptops', condition: 'fully_working', preferredService: 'repair');
      expect(base.toFields().containsKey('aiSuggestion'), isFalse);
      const withAi = ListingInput(name: 'Laptop', category: 'laptops', condition: 'fully_working', preferredService: 'repair', aiSuggestionJson: '{"source":"rules"}');
      expect(withAi.toFields()['aiSuggestion'], '{"source":"rules"}');
    });
  });

  group('AiRepository', () {
    ApiClient client(_Adapter a) => ApiClient(
          store: MemoryKeyValueStore(),
          dio: Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = a,
          refreshDio: Dio(BaseOptions(baseUrl: 'http://test/api'))..httpClientAdapter = _Adapter(() => _json(500, {})),
        );

    test('sends the words and the photo as a form, leaving out empty words', () async {
      final dir = Directory.systemTemp.createTempSync('ai');
      addTearDown(() {
        try {
          dir.deleteSync(recursive: true);
        } on FileSystemException {
          // Windows may still hold the file for a moment; the system clears temp folders.
        }
      });
      final file = File('${dir.path}/a.jpg')..writeAsBytesSync([1, 2, 3]);
      final adapter = _Adapter(() => _json(200, {'success': true, 'data': aiJson()}));
      final s = await AiRepository(client(adapter)).classify(title: '  Dell laptop ', description: '   ', photo: PickedPhoto(path: file.path, name: 'a.jpg', mime: 'image/jpeg', bytes: 3));
      expect(s.brand, 'Dell');
      final sent = adapter.requests.single;
      expect(sent.path, '/ai/classify');
      final form = sent.data as FormData;
      expect(form.fields.map((e) => '${e.key}=${e.value}'), ['title=Dell laptop']);
      expect(form.files.single.key, 'photo');
    });

    test('works with no photo, and turns a server refusal into an ApiException', () async {
      final ok = _Adapter(() => _json(200, {'success': true, 'data': aiJson()}));
      await AiRepository(client(ok)).classify(title: 'laptop');
      expect((ok.requests.single.data as FormData).files, isEmpty);

      final busy = _Adapter(() => _json(429, {'success': false, 'message': 'Too many suggestions just now.', 'code': 'RATE_LIMITED'}));
      await expectLater(AiRepository(client(busy)).classify(title: 'laptop'), throwsA(isA<ApiException>().having((e) => e.statusCode, 'statusCode', 429)));
    });
  });
}