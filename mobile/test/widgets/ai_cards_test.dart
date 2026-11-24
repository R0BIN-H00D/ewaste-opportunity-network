import 'package:ewaste_opportunity/core/network/api_exception.dart';
import 'package:ewaste_opportunity/core/storage/key_value_store.dart';
import 'package:ewaste_opportunity/core/theme/app_theme.dart';
import 'package:ewaste_opportunity/models/ai_result.dart';
import 'package:ewaste_opportunity/providers/ai_providers.dart';
import 'package:ewaste_opportunity/services/ai_repository.dart';
import 'package:ewaste_opportunity/services/api_client.dart';
import 'package:ewaste_opportunity/services/photo_picker.dart';
import 'package:ewaste_opportunity/widgets/ai_cards.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

Map<String, dynamic> resultJson({String source = 'ai', String recommendation = 'repair', String? unavailable}) => {
      'source': source,
      'title': 'Dell Inspiron 15 laptop',
      'category': {'slug': 'laptop', 'name': 'Laptop'},
      'brand': 'Dell',
      'model': 'Inspiron 15',
      'condition': 'major_damage',
      'problems': ['Cracked screen'],
      'advice': {
        'recommendation': recommendation,
        'alternatives': ['refurbishment'],
        'reasons': ['A screen swap is cheaper than a new laptop.'],
        'skillsNeeded': ['Laptop screen replacement'],
      },
      'estimate': {'isEstimate': true, 'resale': {'min': 8000, 'max': 12000}, 'repair': {'min': 3000, 'max': 5000}},
      'notice': 'A suggestion, not a promise.',
      if (unavailable != null) 'unavailableReason': unavailable,
    };

class FakeAiRepository extends AiRepository {
  FakeAiRepository({this.photoAi = true, AiResult? result, this.matchesByKind = const {}, this.error})
      : result = result ?? AiResult.fromJson(resultJson()),
        super(ApiClient(store: MemoryKeyValueStore()));

  final bool photoAi;
  final AiResult result;
  final Map<String, List<MatchItem>> matchesByKind;
  final ApiException? error;
  final analyzed = <({int photos, String text})>[];
  final advised = <String>[];

  @override
  Future<bool> photoAiOn() async => photoAi;

  @override
  Future<AiResult> analyzeDevice(List<PickedPhoto> photos, {String text = ''}) async {
    analyzed.add((photos: photos.length, text: text));
    if (error != null) throw error!;
    return result;
  }

  @override
  Future<AiResult> adviceFor(String listingId) async {
    advised.add(listingId);
    return result;
  }

  @override
  Future<List<MatchItem>> matches(String listingId, String kind) async => matchesByKind[kind] ?? const [];
}

const _photo = PickedPhoto(path: '/tmp/d.png', name: 'd.png', mime: 'image/png', bytes: 10);

Future<void> _pump(WidgetTester tester, Widget child, FakeAiRepository repo) async {
  tester.view.physicalSize = const Size(900, 2600);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final router = GoRouter(routes: [GoRoute(path: '/', builder: (_, __) => Scaffold(body: SingleChildScrollView(child: child)))]);
  addTearDown(router.dispose);
  await tester.pumpWidget(ProviderScope(
    overrides: [aiRepositoryProvider.overrideWithValue(repo)],
    child: MaterialApp.router(theme: AppTheme.light(), routerConfig: router),
  ));
  await tester.pump(const Duration(milliseconds: 50));
  await tester.pump(const Duration(milliseconds: 50));
}

Future<void> _tap(WidgetTester tester, Finder f) async {
  await tester.ensureVisible(f);
  await tester.tap(f);
  for (var i = 0; i < 4; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  group('AiResult', () {
    test('reads the advice, the rough prices and why the AI was not used', () {
      final r = AiResult.fromJson(resultJson(source: 'rules', unavailable: 'The free AI quota for today is used up.'));
      expect(r.fromAi, isFalse);
      expect(r.recommendation, 'repair');
      expect(r.alternatives, ['refurbishment']);
      expect(r.resale!.min, 8000);
      expect(r.repair!.max, 5000);
      expect(r.unavailableReason, contains('quota'));
    });

    test('copes with a missing estimate and a technician match', () {
      final r = AiResult.fromJson({'source': 'rules', 'advice': {'recommendation': 'recycling'}, 'estimate': {'resale': null, 'repair': null}});
      expect(r.resale, isNull);
      expect(r.reasons, isEmpty);
      final m = MatchItem.fromJson({'technician': {'_id': 't1', 'name': 'Ravi'}, 'score': 77.4, 'reasons': ['Close by']});
      expect(m.kind, 'technician');
      expect(m.id, 't1');
      expect(m.name, 'Ravi');
    });
  });

  group('AI help on the list-a-device screen', () {
    testWidgets('says photos go to Google only on the button, then shows the suggestion and fills only when asked', (tester) async {
      final repo = FakeAiRepository();
      AiResult? applied;
      await _pump(tester, AiAssistCard(photos: const [_photo], words: () => 'old dell', onApply: (r) => applied = r), repo);

      expect(find.textContaining('sent to Google only when you press the button'), findsOneWidget);
      expect(repo.analyzed, isEmpty);

      await _tap(tester, find.text('Suggest from my photos'));
      expect(repo.analyzed.single, (photos: 1, text: 'old dell'));
      expect(find.textContaining('Best next step: Repair'), findsOneWidget);
      expect(find.textContaining('Worth about'), findsOneWidget);
      expect(find.textContaining('rough estimates, not offers'), findsOneWidget);
      expect(applied, isNull);

      await _tap(tester, find.text('Use these details'));
      expect(applied!.brand, 'Dell');
    });

    testWidgets('with photo reading off it uses only the words and sends no photo', (tester) async {
      final repo = FakeAiRepository(photoAi: false, result: AiResult.fromJson(resultJson(source: 'rules')));
      await _pump(tester, AiAssistCard(photos: const [_photo], words: () => 'Dell laptop will not turn on', onApply: (_) {}), repo);

      expect(find.textContaining('Photo reading is switched off'), findsOneWidget);
      await _tap(tester, find.text('Suggest from my words'));
      expect(repo.analyzed.single, (photos: 0, text: 'Dell laptop will not turn on'));
      expect(find.textContaining('Suggested from simple rules'), findsOneWidget);
    });

    testWidgets('shows what the server said when it refuses', (tester) async {
      final repo = FakeAiRepository(error: const ApiException('Too many requests, please try again later.', statusCode: 429));
      await _pump(tester, AiAssistCard(photos: const [_photo], words: () => '', onApply: (_) {}), repo);
      await _tap(tester, find.text('Suggest from my photos'));
      expect(find.text('Too many requests, please try again later.'), findsOneWidget);
    });
  });

  group('smart suggestions on my device', () {
    testWidgets('lists refurbishers and wanted requests with their reasons for a refurbishment listing', (tester) async {
      final repo = FakeAiRepository(matchesByKind: {
        'refurbishers': [const MatchItem(id: 'r1', name: 'Near Works', score: 82, reasons: ['Takes this kind of device', '2.1 km away'])],
        'wanted': [const MatchItem(id: 'w1', name: 'Dell laptops wanted', score: 70, reasons: ['Looking for Dell'])],
      });
      await _pump(tester, const SmartMatchesCard(listingId: 'l1', service: 'refurbishment'), repo);
      expect(find.text('Near Works'), findsOneWidget);
      expect(find.textContaining('2.1 km away'), findsOneWidget);
      expect(find.text('82% match'), findsOneWidget);
      expect(find.text('Dell laptops wanted'), findsOneWidget);
    });

    testWidgets('says so when no one fits yet, and asks the AI for advice on request', (tester) async {
      final repo = FakeAiRepository();
      await _pump(tester, const SmartMatchesCard(listingId: 'l1', service: 'recycling'), repo);
      expect(find.textContaining('No one fits yet'), findsOneWidget);
      await _tap(tester, find.text('Repair, refurbish, reuse or recycle?'));
      expect(repo.advised, ['l1']);
      expect(find.textContaining('Best next step: Repair'), findsOneWidget);
    });
  });
}
