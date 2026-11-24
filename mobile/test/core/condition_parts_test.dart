import 'dart:convert';

import 'package:ewaste_opportunity/core/condition_parts.dart';
import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/models/listing_input.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('the parts asked about', () {
    List<String> keys(String? slug) => conditionPartsFor(slug).map((p) => p.key).toList();

    test('fit the category, and an unknown category still gets the basics', () {
      expect(keys('smartphone'), ['power', 'screen', 'battery', 'body', 'charging', 'ports', 'sound', 'camera', 'water']);
      expect(keys('television'), ['power', 'screen', 'body', 'ports', 'sound', 'water']);
      expect(keys('keyboard'), ['body', 'ports', 'water']);
      expect(keys('battery'), ['battery', 'body']);
      expect(keys('something-new'), ['power', 'body', 'water']);
      expect(keys(null), ['power', 'body', 'water']);
    });

    test('every option has a label and the choices match what the server accepts', () {
      expect(conditionParts.map((p) => p.key), ['power', 'screen', 'battery', 'body', 'charging', 'ports', 'sound', 'camera', 'water']);
      for (final part in conditionParts) {
        expect(part.options, isNotEmpty);
        for (final (value, label) in part.options) {
          expect(value, matches(RegExp(r'^[a-z_]+$')));
          expect(label, isNotEmpty);
        }
      }
    });
  });

  group('suggesting an overall condition', () {
    test('nothing answered, nothing suggested', () {
      expect(suggestCondition({}), '');
      expect(suggestCondition({'battery': '', 'screen': ''}), '');
    });

    test('follows the worst answer', () {
      expect(suggestCondition({'power': 'works_normally', 'screen': 'no_damage', 'battery': 'holds_well'}), 'fully_working');
      expect(suggestCondition({'power': 'works_normally', 'battery': 'drains_fast'}), 'minor_damage');
      expect(suggestCondition({'screen': 'cracked', 'battery': 'holds_well'}), 'major_damage');
      expect(suggestCondition({'water': 'damaged'}), 'major_damage');
      expect(suggestCondition({'power': 'does_not_turn_on', 'screen': 'no_damage'}), 'not_working');
    });
  });

  test('conditionRows lists the answered parts in words, in the usual order', () {
    expect(conditionRows({'battery': 'drains_fast', 'screen': 'cracked', 'camera': ''}), [('Screen', 'Cracked'), ('Battery', 'Drains quickly')]);
    expect(conditionRows({}), isEmpty);
    expect(conditionRows({'screen': 'not-a-real-answer'}), isEmpty);
  });

  group('sent to and read from the server', () {
    const base = ListingInput(name: 'Old phone', category: 'smartphone', condition: 'minor_damage', preferredService: 'repair');

    test('only answered parts go up, as JSON; nothing answered sends nothing', () {
      expect(base.toFields().containsKey('conditionDetails'), isFalse);
      const withEmpty = ListingInput(name: 'Old phone', category: 'smartphone', condition: 'minor_damage', preferredService: 'repair', conditionDetails: {'battery': ''});
      expect(withEmpty.toFields().containsKey('conditionDetails'), isFalse);
      const answered = ListingInput(name: 'Old phone', category: 'smartphone', condition: 'minor_damage', preferredService: 'repair', conditionDetails: {'battery': 'drains_fast', 'screen': ''});
      expect(jsonDecode(answered.toFields()['conditionDetails']!), {'battery': 'drains_fast'});
    });

    test('a listing reads its answers back, and copes with none', () {
      final withAnswers = Listing.fromJson({'_id': 'l1', 'title': 'Phone', 'condition': 'minor_damage', 'preferredService': 'repair', 'status': 'listed', 'conditionDetails': {'battery': 'drains_fast', 'screen': 'cracked'}});
      expect(withAnswers.conditionDetails, {'battery': 'drains_fast', 'screen': 'cracked'});
      final without = Listing.fromJson({'_id': 'l2', 'title': 'Phone', 'condition': 'minor_damage', 'preferredService': 'repair', 'status': 'listed'});
      expect(without.conditionDetails, isEmpty);
    });
  });
}
