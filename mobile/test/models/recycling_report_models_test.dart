import 'package:ewaste_opportunity/models/recycling_report.dart';
import 'package:flutter_test/flutter_test.dart';

/// The recycling centre's report as `GET /api/recycling-requests/report` sends it.
Map<String, dynamic> reportJson({bool empty = false}) => {
      'center': 'GreenCycle Recyclers',
      'range': {'from': '2026-11-01T00:00:00.000Z', 'to': null},
      'requests': {
        'total': empty ? 0 : 7,
        'byStatus': empty
            ? <String, dynamic>{}
            : {'requested': 2, 'completed': 4, 'rejected': 1, 'cancelled': 0},
      },
      'completed': {'count': empty ? 0 : 4, 'devices': empty ? 0 : 9},
      'materials': [
        {
          'type': 'copper',
          'actualKg': empty ? 0 : 3.25,
          'estimatedKg': empty ? 0 : 1.5
        },
        {'type': 'aluminium', 'actualKg': 0, 'estimatedKg': empty ? 0 : 2},
        {'type': 'iron', 'actualKg': 0, 'estimatedKg': 0},
      ],
      'totals': {'actualKg': empty ? 0 : 3.25, 'estimatedKg': empty ? 0 : 3.5},
      'byCategory': empty
          ? <Object>[]
          : [
              {
                'category': {'_id': 'c1', 'name': 'Phones', 'slug': 'phones'},
                'requests': 3,
                'devices': 5
              },
            ],
      'items': empty
          ? <Object>[]
          : [
              {
                '_id': 'r1',
                'refNo': 'REC-2026-0001',
                'completedAt': '2026-11-12T09:00:00.000Z',
                'deviceCount': 2,
                'categories': ['Phones'],
                'materials': [
                  {'type': 'copper', 'actualKg': 1.2, 'estimatedKg': null},
                ],
              },
            ],
    };

void main() {
  group('the recycling report', () {
    test('reads requests, completions, materials, categories and items', () {
      final r = RecyclingReport.fromJson(reportJson());
      expect(r.center, 'GreenCycle Recyclers');
      expect(r.from, isNotNull);
      expect(r.to, isNull);
      expect(r.totalRequests, 7);
      expect(r.byStatus['completed'], 4);
      expect(r.completedCount, 4);
      expect(r.completedDevices, 9);
      expect(r.totalActualKg, 3.25);
      expect(r.totalEstimatedKg, 3.5);
      expect(r.byCategory.single.name, 'Phones');
      expect(r.byCategory.single.devices, 5);
      expect(r.items.single.refNo, 'REC-2026-0001');
      expect(r.items.single.materials.single.estimatedKg, 0);
    });

    test('measured and estimated stay apart, and empty materials are left out',
        () {
      final r = RecyclingReport.fromJson(reportJson());
      expect(r.recovered.map((m) => m.type), ['copper', 'aluminium']);
      expect(r.recovered.first.actualKg, 3.25);
      expect(r.recovered.first.estimatedKg, 1.5);
      expect(r.recovered.last.actualKg, 0);
      expect(r.recovered.last.estimatedKg, 2);
    });

    test('an empty period has nothing in it', () {
      final r = RecyclingReport.fromJson(reportJson(empty: true));
      expect(r.recovered, isEmpty);
      expect(r.items, isEmpty);
      expect(r.totalRequests, 0);
    });
  });
}
