import 'package:ewaste_opportunity/core/format.dart';
import 'package:ewaste_opportunity/models/impact.dart';
import 'package:flutter_test/flutter_test.dart';
import '../fakes.dart';

void main() {
  group('GreenScore.fromJson', () {
    test('reads the score, level, badges and the first page of the history', () {
      final s = GreenScore.fromJson(greenScoreJson());
      expect(s.score, 92);
      expect([s.level.key, s.level.name, s.level.nextName, s.level.nextMin], ['seed', 'Seed', 'Sprout', 100]);
      expect(s.level.progress, 0.92);
      expect(s.level.pointsToNext(s.score), 8);
      expect(s.badges.map((b) => b.key), ['first_repair', 'donor', 'material_saver']);
      expect(s.earnedBadges.map((b) => b.name), ['First repair']);
      expect(s.ledger.map((l) => l.points), [40, 50]);
    });

    test('a locked badge knows how far along it is', () {
      final b = GreenScore.fromJson(greenScoreJson()).badges.last;
      expect([b.earned, b.done, b.needed], [false, 2.5, 10]);
    });

    test('the top level has no next level, and no points left to earn', () {
      final level = GreenLevel.fromJson({'key': 'forest', 'name': 'Forest', 'min': 1000, 'next': null, 'progress': 1});
      expect(level.isTop, isTrue);
      expect(level.pointsToNext(5000), 0);
    });

    test('points to the next level never go negative', () {
      final level = GreenLevel.fromJson({'key': 'seed', 'name': 'Seed', 'min': 0, 'next': {'name': 'Sprout', 'min': 100}, 'progress': 1});
      expect(level.pointsToNext(150), 0);
    });

    test('missing pieces become sensible empties, not crashes', () {
      final s = GreenScore.fromJson({});
      expect([s.score, s.level.name, s.badges, s.ledger], [0, 'Seed', isEmpty, isEmpty]);
    });

    test('a progress outside 0 to 1 is held to it', () {
      expect(GreenLevel.fromJson({'progress': 7}).progress, 1);
      expect(GreenLevel.fromJson({'progress': -3}).progress, 0);
    });
  });

  group('LedgerEntry', () {
    test('a reversal is recognised and carries negative points', () {
      final e = LedgerEntry.fromJson({'_id': 'l', 'points': -50, 'rule': 'reversal', 'label': 'Removed', 'createdAt': '2026-11-16T09:00:00.000Z'});
      expect([e.isReversal, e.points, e.at != null], [true, -50, true]);
      expect(LedgerEntry.fromJson({'points': 40, 'rule': 'donation_completed'}).isReversal, isFalse);
    });
  });

  group('ImpactSummary.fromJson', () {
    test('keeps counts, measured weight, estimated weight and CO2e separate', () {
      final s = ImpactSummary.fromJson(impactJson());
      expect([s.devicesTotal, s.events], [3, 2]);
      expect(s.byType, {'repair': 1, 'reuse': 0, 'donation': 2, 'refurbishment': 0, 'recycling': 0});
      expect([s.measuredKg, s.estimatedKg, s.co2eKg], [1.5, 2.0, 150.0]);
      expect(s.method, contains('estimate'));
      expect(s.isEmpty, isFalse);
    });

    test('is empty only when there is nothing at all', () {
      expect(ImpactSummary.fromJson(impactJson(devices: 0, measured: 0, estimated: 0, co2e: 0)).isEmpty, isTrue);
      expect(ImpactSummary.fromJson(impactJson(devices: 0, measured: 0.5, estimated: 0)).isEmpty, isFalse);
      expect(const ImpactSummary().isEmpty, isTrue);
    });

    test('an empty answer is all zeros', () {
      final s = ImpactSummary.fromJson({});
      expect([s.devicesTotal, s.measuredKg, s.estimatedKg, s.co2eKg], [0, 0, 0, 0]);
    });
  });

  group('MonthImpact and ScoringRules', () {
    test('a month reads its counts and weights', () {
      final m = MonthImpact.fromJson({'month': '2026-11', 'devices': 2, 'byType': {'donation': 2}, 'measuredKg': 1, 'estimatedKg': 2.5, 'co2eKgEstimated': 100});
      expect([m.month, m.devices, m.byType['donation'], m.measuredKg, m.estimatedKg, m.co2eKg], ['2026-11', 2, 2, 1.0, 2.5, 100.0]);
    });

    test('the rules read as the server sent them', () {
      final r = ScoringRules.fromJson({
        'rules': [{'key': 'repair_completed', 'points': 50, 'label': 'A repair', 'who': 'the person who asked'}],
        'dailyCap': 10,
        'notes': ['one', 'two'],
        'method': 'M',
      });
      expect([r.rules.single.points, r.dailyCap, r.notes, r.method], [50, 10, ['one', 'two'], 'M']);
    });
  });

  group('formatWeight', () {
    test('shows at most one decimal, none for a whole number', () {
      expect(formatWeight(1.5), '1.5 kg');
      expect(formatWeight(12), '12 kg');
      expect(formatWeight(0), '0 kg');
      expect(formatWeight(0.04), '0 kg');
      expect(formatWeight(2.26), '2.3 kg');
    });
  });

  group('formatMonthKey', () {
    test('a month name for the axis, with the year on request', () {
      expect(formatMonthKey('2026-11'), 'Nov');
      expect(formatMonthKey('2026-01', withYear: true), 'Jan 2026');
      expect(formatMonthKey('2026-12'), 'Dec');
    });

    test('something unreadable comes back as it was', () {
      expect(formatMonthKey('nonsense'), 'nonsense');
      expect(formatMonthKey('2026-13'), '2026-13');
      expect(formatMonthKey(''), '');
    });
  });

  test('every kind of activity has a label', () {
    expect(impactTypeLabels.keys, containsAll(['repair', 'reuse', 'donation', 'refurbishment', 'recycling']));
  });
}
