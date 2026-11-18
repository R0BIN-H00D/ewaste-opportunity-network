import 'package:ewaste_opportunity/core/format.dart';
import 'package:ewaste_opportunity/models/impact.dart';
import 'package:flutter_test/flutter_test.dart';
import '../fakes.dart';

void main() {
  group('ImpactSummary.fromJson', () {
    test('keeps counts, measured weight, estimated weight and CO2e separate',
        () {
      final s = ImpactSummary.fromJson(impactJson());
      expect([s.devicesTotal, s.events], [3, 2]);
      expect(s.byType, {
        'repair': 1,
        'reuse': 0,
        'donation': 2,
        'refurbishment': 0,
        'recycling': 0
      });
      expect([s.measuredKg, s.estimatedKg, s.co2eKg], [1.5, 2.0, 150.0]);
      expect(s.method, contains('estimate'));
      expect(s.isEmpty, isFalse);
    });

    test('is empty only when there is nothing at all', () {
      expect(
          ImpactSummary.fromJson(
                  impactJson(devices: 0, measured: 0, estimated: 0, co2e: 0))
              .isEmpty,
          isTrue);
      expect(
          ImpactSummary.fromJson(
                  impactJson(devices: 0, measured: 0.5, estimated: 0))
              .isEmpty,
          isFalse);
      expect(const ImpactSummary().isEmpty, isTrue);
    });

    test('an empty answer is all zeros', () {
      final s = ImpactSummary.fromJson({});
      expect([s.devicesTotal, s.measuredKg, s.estimatedKg, s.co2eKg],
          [0, 0, 0, 0]);
    });
  });

  group('MonthImpact', () {
    test('a month reads its counts and weights', () {
      final m = MonthImpact.fromJson({
        'month': '2026-11',
        'devices': 2,
        'byType': {'donation': 2},
        'measuredKg': 1,
        'estimatedKg': 2.5,
        'co2eKgEstimated': 100
      });
      expect([
        m.month,
        m.devices,
        m.byType['donation'],
        m.measuredKg,
        m.estimatedKg,
        m.co2eKg
      ], [
        '2026-11',
        2,
        2,
        1.0,
        2.5,
        100.0
      ]);
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
    expect(
        impactTypeLabels.keys,
        containsAll(
            ['repair', 'reuse', 'donation', 'refurbishment', 'recycling']));
  });
}
