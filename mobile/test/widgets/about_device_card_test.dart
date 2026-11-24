import 'package:ewaste_opportunity/core/condition_parts.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/marketplace.dart';
import 'package:ewaste_opportunity/widgets/about_device_card.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import '../models/marketplace_models_test.dart' show productJson;

const _details = {
  'power': 'works_normally',
  'battery': 'drains_fast',
  'screen': 'no_damage',
  'body': 'scratched_or_dented',
  'charging': 'normal',
  'ports': 'all_work',
  'camera': 'faulty',
  'water': 'none',
};

Future<void> _pump(WidgetTester tester, {Map<String, String> details = const {}, String? note, String condition = 'good'}) async {
  tester.view.physicalSize = const Size(900, 2600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(MaterialApp(
    theme: AppTheme.light(),
    home: Scaffold(body: SingleChildScrollView(child: AboutDeviceCard(condition: condition, details: details, note: note))),
  ));
}

void main() {
  group('the About this device card', () {
    testWidgets('shows the overall condition and the first four parts, with a Read more button', (tester) async {
      await _pump(tester, details: _details, note: 'Charger included. Small scratch on the lid.');
      expect(find.text('About this device'), findsOneWidget);
      expect(find.text('Overall condition: Good'), findsOneWidget);
      for (final label in ['Working condition', 'Battery', 'Screen', 'Scratches and body']) {
        expect(find.text(label), findsOneWidget);
      }
      expect(find.text('Turns on and works normally'), findsOneWidget);
      expect(find.text('Drains quickly'), findsOneWidget);
      // the rest and the seller's own remarks wait behind the button
      expect(find.text('Charging'), findsNothing);
      expect(find.text('Camera'), findsNothing);
      expect(find.text('Other notes from the seller'), findsNothing);
      expect(find.text('Read more'), findsOneWidget);
    });

    testWidgets('opens everything on Read more, and closes again on Show less', (tester) async {
      await _pump(tester, details: _details, note: 'Charger included. Small scratch on the lid.');
      await tester.tap(find.text('Read more'));
      await tester.pump();
      for (final label in ['Charging', 'Ports and buttons', 'Camera', 'Water damage']) {
        expect(find.text(label), findsOneWidget);
      }
      expect(find.text('Other notes from the seller'), findsOneWidget);
      expect(find.text('Charger included. Small scratch on the lid.'), findsOneWidget);
      expect(find.text('Show less'), findsOneWidget);

      await tester.tap(find.text('Show less'));
      await tester.pump();
      expect(find.text('Camera'), findsNothing);
      expect(find.text('Read more'), findsOneWidget);
    });

    testWidgets('says in words which answers are fine and which are not, for screen readers', (tester) async {
      await _pump(tester, details: _details);
      expect(find.bySemanticsLabel('Drains quickly, Minor issue'), findsOneWidget);
      expect(find.bySemanticsLabel('No damage, Good'), findsOneWidget);
    });

    testWidgets('has no Read more button with four parts or fewer and no notes', (tester) async {
      await _pump(tester, details: const {'battery': 'holds_well', 'screen': 'no_damage'});
      expect(find.text('Holds charge well'), findsOneWidget);
      expect(find.text('Read more'), findsNothing);
    });

    testWidgets('offers Read more for the notes alone', (tester) async {
      await _pump(tester, details: const {'battery': 'holds_well'}, note: 'Comes with its box.');
      expect(find.text('Comes with its box.'), findsNothing);
      await tester.tap(find.text('Read more'));
      await tester.pump();
      expect(find.text('Comes with its box.'), findsOneWidget);
    });

    testWidgets('says honestly that the seller has not added the details yet', (tester) async {
      await _pump(tester);
      expect(find.textContaining('The seller has not added the details of each part yet'), findsOneWidget);
      expect(find.text('Overall condition: Good'), findsOneWidget);
      expect(find.text('Read more'), findsNothing);
    });
  });

  group('part wording and tone', () {
    test('rows use buyer wording, in the usual order, and skip blanks and unknown answers', () {
      final rows = aboutRows({'battery': 'drains_fast', 'power': 'works_normally', 'camera': '', 'screen': 'not-an-answer'});
      expect([for (final r in rows) (r.label, r.answer)], [('Working condition', 'Turns on and works normally'), ('Battery', 'Drains quickly')]);
    });

    test('tones follow how serious the answer is', () {
      expect(partTone('battery', 'holds_well'), PartTone.good);
      expect(partTone('battery', 'drains_fast'), PartTone.warn);
      expect(partTone('battery', 'swollen'), PartTone.bad);
      expect(partTone('screen', 'cracked'), PartTone.bad);
      expect(partTone('water', 'suspected'), PartTone.warn);
    });

    test('the required parts for a category come in the order buyers are asked', () {
      expect(requiredPartsFor('smartphone').map((p) => p.key), ['battery', 'screen', 'ports', 'water']);
      expect(optionalPartsFor('smartphone').map((p) => p.key), ['power', 'body', 'charging', 'sound', 'camera']);
    });
  });

  test('a product reads its details and remarks from the server', () {
    final p = Product.fromJson({...productJson(detail: true), 'conditionDetails': {'battery': 'drains_fast', 'screen': 'no_damage'}, 'conditionNote': 'Box included.'});
    expect(p.conditionDetails, {'battery': 'drains_fast', 'screen': 'no_damage'});
    expect(p.conditionNote, 'Box included.');
    final bare = Product.fromJson(productJson(detail: true));
    expect(bare.conditionDetails, isEmpty);
    expect(bare.conditionNote, isNull);
  });
}
