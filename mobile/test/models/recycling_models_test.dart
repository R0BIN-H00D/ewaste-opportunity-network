import 'package:ewaste_opportunity/core/format.dart';
import 'package:ewaste_opportunity/core/recycling_validation.dart';
import 'package:ewaste_opportunity/models/recycling.dart';
import 'package:flutter_test/flutter_test.dart';

/// A centre as `GET /api/recycling-centers` (and, with [detail], `/:id`) sends it.
Map<String, dynamic> centerJson({String id = 'ce1', String name = 'GreenCycle Recyclers', bool detail = false}) => {
      '_id': id,
      'name': name,
      'city': 'Bengaluru',
      'authorized': true,
      'authorizationNo': 'KSPCB/2024/118',
      'authorizingBody': 'State Pollution Control Board',
      'validUntil': '2030-01-01T00:00:00.000Z',
      'acceptedCategories': [
        {'_id': 'c1', 'name': 'Phones', 'slug': 'phones', 'icon': 'phone'},
        {'_id': 'c2', 'name': 'Laptops', 'slug': 'laptops', 'icon': 'laptop'},
      ],
      'operatingHours': 'Mon to Sat, 9 am to 6 pm',
      'ratingAvg': 4.5,
      'ratingCount': 12,
      if (detail) ...{
        'facilityDetails': 'Licensed e-waste facility with a data-destruction room.',
        'collectionAreas': [
          {'label': 'North Bengaluru', 'addressArea': 'Yelahanka'},
        ],
        'totals': {'actualKg': 120.5, 'estimatedKg': 0},
      },
    };

/// A recycling request as the server sends it. Without [detail] it is the short form used in lists.
Map<String, dynamic> recyclingJson({
  String id = 'rr1',
  String status = 'requested',
  String role = 'requester',
  List<String> actions = const [],
  bool detail = true,
  bool address = true,
  List<Map<String, dynamic>> materials = const [],
  Map<String, dynamic>? pickup,
  bool byUser = false,
  bool byCenter = false,
  String? cancelReason,
}) {
  double sum(String key) => materials.fold(0.0, (t, m) => t + ((m[key] as num?)?.toDouble() ?? 0));
  return {
    '_id': id,
    'refNo': 'REC-2026-AB12CD',
    'status': status,
    'viewerRole': role,
    'categories': [
      {'_id': 'c1', 'name': 'Phones', 'slug': 'phones'},
    ],
    'deviceCount': 3,
    'photos': [
      {'url': '/uploads/recycling/a.jpg'},
    ],
    'pickupAddressArea': 'Indiranagar',
    if (address) 'pickupAddress': '12 MG Road, Indiranagar',
    'preferredDate': '2026-12-01T00:00:00.000Z',
    'notes': 'Ring the bell',
    'center': {'_id': 'ce1', 'name': 'GreenCycle Recyclers', 'city': 'Bengaluru'},
    'requester': {'_id': 'u1', 'name': 'Asha'},
    'listing': null,
    'createdAt': '2026-11-10T09:00:00.000Z',
    'updatedAt': '2026-11-12T09:00:00.000Z',
    if (detail) ...{
      'pickup': pickup,
      'confirmations': {'requester': byUser, 'center': byCenter, 'checklistAcknowledged': byUser},
      'materials': materials,
      'totals': {'actualKg': sum('actualKg'), 'estimatedKg': sum('estimatedKg')},
      'reportNotes': null,
      'history': [
        {'status': 'requested', 'at': '2026-11-10T09:00:00.000Z', 'note': 'Request sent'},
      ],
      if (cancelReason != null) 'cancelReason': cancelReason,
      'actions': actions,
    },
  };
}

void main() {
  group('RecyclingCenter', () {
    test('reads the directory form', () {
      final c = RecyclingCenter.fromJson(centerJson());
      expect(c.name, 'GreenCycle Recyclers');
      expect(c.city, 'Bengaluru');
      expect(c.authorized, isTrue);
      expect(c.acceptedCategories.map((x) => x.name), ['Phones', 'Laptops']);
      expect(c.operatingHours, 'Mon to Sat, 9 am to 6 pm');
      expect(c.hasRating, isTrue);
      expect(c.validUntil, isNotNull);
      expect(c.collectionAreas, isEmpty);
    });

    test('reads the detail form: facility, collection areas and the weights recovered', () {
      final c = RecyclingCenter.fromJson(centerJson(detail: true));
      expect(c.facilityDetails, contains('data-destruction'));
      expect(c.collectionAreas, ['North Bengaluru']);
      expect(c.totalActualKg, 120.5);
      expect(c.totalEstimatedKg, 0);
    });

    test('missing fields fall back to safe values', () {
      final c = RecyclingCenter.fromJson(const {'_id': 'x'});
      expect(c.name, 'Recycling centre');
      expect(c.authorized, isFalse);
      expect(c.acceptedCategories, isEmpty);
      expect(c.hasRating, isFalse);
    });
  });

  group('RecyclingRequest', () {
    test('the list form has no actions or history', () {
      final r = RecyclingRequest.fromJson(recyclingJson(detail: false));
      expect(r.refNo, 'REC-2026-AB12CD');
      expect(r.deviceCount, 3);
      expect(r.categoryNames, 'Phones');
      expect(r.centerName, 'GreenCycle Recyclers');
      expect(r.requesterName, 'Asha');
      expect(r.actions, isEmpty);
      expect(r.history, isEmpty);
      expect(r.isCenterView, isFalse);
    });

    test('the detail form reads actions, handover, materials and history', () {
      final r = RecyclingRequest.fromJson(recyclingJson(
        status: 'received_at_center',
        role: 'center',
        actions: ['record_materials', 'process'],
        byUser: true,
        byCenter: true,
        pickup: {'date': '2026-11-20T10:00:00.000Z', 'timeSlot': 'Morning', 'status': 'collected'},
        materials: [
          {'type': 'copper', 'actualKg': 4.5, 'estimatedKg': null},
          {'type': 'plastics', 'actualKg': null, 'estimatedKg': 2},
        ],
      ));
      expect(r.isCenterView, isTrue);
      expect(r.can('process'), isTrue);
      expect(r.can('cancel'), isFalse);
      expect(r.requesterConfirmed && r.centerConfirmed, isTrue);
      expect(r.pickup?.timeSlot, 'Morning');
      expect(r.materials.map((m) => m.type), ['copper', 'plastics']);
      expect(r.materials.first.estimatedKg, isNull);
      expect(r.materials.last.actualKg, isNull);
      // Measured and estimated are totalled apart (BR-06).
      expect(r.totalActualKg, 4.5);
      expect(r.totalEstimatedKg, 2);
      expect(r.history.single.note, 'Request sent');
    });

    test('the exact address is only there when the server sends it', () {
      expect(RecyclingRequest.fromJson(recyclingJson()).pickupAddress, '12 MG Road, Indiranagar');
      expect(RecyclingRequest.fromJson(recyclingJson(role: 'center', address: false)).pickupAddress, isNull);
    });

    test('finished requests are final', () {
      for (final s in ['completed', 'rejected', 'cancelled']) {
        expect(RecyclingRequest.fromJson(recyclingJson(status: s)).isFinished, isTrue, reason: s);
      }
      expect(RecyclingRequest.fromJson(recyclingJson(status: 'processed')).isFinished, isFalse);
    });
  });

  test('a recovered material is sent with only the weights that were given', () {
    expect(const RecoveredMaterial(type: 'copper', actualKg: 4).toJson(), {'type': 'copper', 'actualKg': 4.0});
    expect(const RecoveredMaterial(type: 'glass', estimatedKg: 1.5).toJson(), {'type': 'glass', 'estimatedKg': 1.5});
  });

  group('labels and numbers', () {
    test('every status has a label, and the centre has its own words where they differ', () {
      for (final s in ['requested', 'accepted', 'pickup_scheduled', 'collected', 'received_at_center', 'processed', 'completed', 'rejected', 'cancelled']) {
        expect(recyclingStatusLabels.containsKey(s), isTrue, reason: s);
      }
      expect(recyclingStatusLabel('requested'), 'Waiting for the centre');
      expect(recyclingStatusLabel('requested', center: true), 'New request');
      expect(recyclingStatusLabel('accepted', center: true), 'Accepted');
      expect(recyclingStatusLabel('something_new'), 'something_new');
    });

    test('kilograms read naturally', () {
      expect(formatKg(12), '12 kg');
      expect(formatKg(0.45), '0.45 kg');
      expect(formatKg(1.5), '1.5 kg');
      expect(formatKg(0), '0 kg');
    });

    test('material labels', () {
      expect(labelOf(materialTypes, 'aluminium'), 'Aluminium');
    });
  });

  group('validation', () {
    test('pickup area and address', () {
      expect(validatePickupArea(''), isNotNull);
      expect(validatePickupArea('A'), isNotNull);
      expect(validatePickupArea('Indiranagar'), isNull);
      expect(validatePickupAddress('MG'), isNotNull);
      expect(validatePickupAddress('12 MG Road'), isNull);
      expect(validatePickupAddress('x' * 251), isNotNull);
    });

    test('notes are optional but limited', () {
      expect(validateRecyclingNotes(null), isNull);
      expect(validateRecyclingNotes('x' * 501), isNotNull);
    });

    test('weights: empty is fine, text and negatives are not', () {
      expect(validateKg(''), isNull);
      expect(validateKg(' 4.5 '), isNull);
      expect(validateKg('abc'), isNotNull);
      expect(validateKg('-1'), isNotNull);
      expect(validateKg('2000000'), isNotNull);
      expect(parseKg(''), isNull);
      expect(parseKg('4.5'), 4.5);
    });
  });
}
