import 'package:ewaste_opportunity/models/service_request.dart';
import 'package:ewaste_opportunity/models/technician.dart';
import 'package:flutter_test/flutter_test.dart';

/// A technician as `GET /api/technicians` sends them.
Map<String, dynamic> technicianJson({String id = 't1', String name = 'Ravi Kumar'}) => {
      '_id': id,
      'name': name,
      'headline': 'Phone and laptop repairs',
      'experienceYears': 6,
      'qualifications': ['ITI electronics'],
      'specializations': ['Screens', 'Batteries'],
      'categories': [
        {'_id': 'c1', 'name': 'Phones', 'slug': 'phones'}
      ],
      'serviceAddressArea': 'Indiranagar',
      'city': 'Bengaluru',
      'serviceRadiusKm': 15,
      'baseRate': 300,
      'availability': {'status': 'available'},
      'ratingAvg': 4.5,
      'ratingCount': 12,
      'completedJobs': 40,
      'distanceKm': 2.5,
    };

/// A service request as `GET /api/service-requests/:id` sends it to the device owner.
Map<String, dynamic> requestJson({String id = 'r1', String status = 'request_submitted', List<String> actions = const [], bool onSite = false, bool quote = false}) => {
      '_id': id,
      'status': status,
      'mode': 'targeted',
      'onSite': onSite,
      'issueDescription': 'Screen is cracked',
      'listing': {
        '_id': 'l1',
        'title': 'Old Samsung phone',
        'brand': 'Samsung',
        'model': 'A12',
        'addressArea': 'Indiranagar',
        'city': 'Bengaluru',
        'category': {'name': 'Phones', 'slug': 'phones'},
        'device': {
          'photos': [
            {'url': '/uploads/devices/a.jpg'}
          ]
        },
      },
      'customer': {'_id': 'u1', 'name': 'Asha'},
      'technician': {'_id': 't1', 'name': 'Ravi Kumar'},
      'activeQuotation': quote
          ? {
              '_id': 'q1',
              'amount': 2500,
              'status': 'submitted',
              'version': 2,
              'breakdown': [
                {'label': 'Screen', 'amount': 2000},
                {'label': 'Labour', 'amount': 500},
              ],
              'parts': ['Display'],
              'etaDays': 3,
              'validUntil': '2030-01-10T00:00:00.000Z',
              'notes': 'Genuine part',
            }
          : null,
      'statusHistory': [
        {'status': 'request_submitted', 'at': '2026-11-14T10:00:00.000Z', 'note': 'Screen is cracked'},
        {'status': status, 'at': '2026-11-15T10:00:00.000Z'},
      ],
      'handover': {
        'collect': {'owner': true, 'provider': false, 'checklistAcknowledged': true},
        'delivery': {'owner': false, 'provider': false},
      },
      'pickup': {'date': '2026-11-20T05:30:00.000Z', 'timeSlot': 'Morning', 'status': 'confirmed'},
      'actions': actions,
      'reviewed': false,
      'createdAt': '2026-11-14T10:00:00.000Z',
      'updatedAt': '2026-11-15T10:00:00.000Z',
    };

void main() {
  group('Technician.fromJson', () {
    test('reads the public profile', () {
      final t = Technician.fromJson(technicianJson());
      expect(t.id, 't1');
      expect(t.name, 'Ravi Kumar');
      expect(t.specializations, ['Screens', 'Batteries']);
      expect(t.categories, ['Phones']);
      expect(t.place, 'Indiranagar, Bengaluru');
      expect(t.availability, 'available');
      expect(t.isAvailable, isTrue);
      expect(t.hasRating, isTrue);
      expect(t.distanceKm, 2.5);
    });

    test('copes with a bare profile', () {
      final t = Technician.fromJson({'_id': 't2', 'name': 'Meena'});
      expect(t.availability, 'available');
      expect(t.hasRating, isFalse);
      expect(t.place, '');
      expect(t.categories, isEmpty);
    });

    test('"unavailable" is not available', () {
      final t = Technician.fromJson({'_id': 't2', 'name': 'Meena', 'availability': {'status': 'unavailable'}});
      expect(t.isAvailable, isFalse);
    });
  });

  group('ServiceRequest.fromJson', () {
    test('reads the device, technician, quote, history and actions', () {
      final r = ServiceRequest.fromJson(requestJson(status: 'customer_approval_pending', actions: ['approve_quotation', 'cancel'], quote: true));
      expect(r.id, 'r1');
      expect(r.deviceTitle, 'Old Samsung phone');
      expect(r.deviceSubtitle, 'Phones · Samsung · A12');
      expect(r.deviceArea, 'Indiranagar, Bengaluru');
      expect(r.devicePhoto?.url, '/uploads/devices/a.jpg');
      expect(r.technicianName, 'Ravi Kumar');
      expect(r.quotation?.amount, 2500);
      expect(r.quotation?.version, 2);
      expect(r.quotation?.breakdown.map((l) => l.label), ['Screen', 'Labour']);
      expect(r.quotation?.parts, ['Display']);
      expect(r.quotation?.etaDays, 3);
      expect(r.history, hasLength(2));
      expect(r.history.last.status, 'customer_approval_pending');
      expect(r.pickup?.timeSlot, 'Morning');
      expect(r.handover.collectOwner, isTrue);
      expect(r.handover.collectProvider, isFalse);
      expect(r.handover.checklistDone, isTrue);
      expect(r.can('approve_quotation'), isTrue);
      expect(r.can('confirm_handover'), isFalse);
      expect(r.isFinished, isFalse);
    });

    test('no quote when there is none, and finished states are recognised', () {
      final r = ServiceRequest.fromJson(requestJson(status: 'cancelled'));
      expect(r.quotation, isNull);
      expect(r.isFinished, isTrue);
    });

    test('reads the technician\'s progress notes and photos, skipping blank notes', () {
      final json = requestJson(status: 'repair_in_progress')
        ..['repairNotes'] = [
          {'text': 'Battery ordered', 'at': '2026-11-16T09:00:00.000Z'},
          {'text': '   '},
          {'text': 'Battery fitted, testing', 'at': '2026-11-16T12:00:00.000Z'},
        ]
        ..['progressPhotos'] = [
          {'url': '/uploads/service/p1.jpg'},
        ];
      final r = ServiceRequest.fromJson(json);
      expect(r.repairNotes.map((n) => n.text), ['Battery ordered', 'Battery fitted, testing']);
      expect(r.repairNotes.first.at, DateTime.utc(2026, 11, 16, 9));
      expect(r.progressPhotos.single.url, '/uploads/service/p1.jpg');
      expect(ServiceRequest.fromJson(requestJson()).repairNotes, isEmpty);
    });

    test('reads when the device is due back, if the technician said', () {
      final json = requestJson(status: 'device_delivery_pending')..['returnSchedule'] = {'date': '2026-11-18T11:30:00.000Z', 'timeSlot': '5 pm - 7 pm'};
      final r = ServiceRequest.fromJson(json);
      expect(r.returnSchedule?.date, DateTime.utc(2026, 11, 18, 11, 30));
      expect(r.returnSchedule?.timeSlot, '5 pm - 7 pm');
      expect(ServiceRequest.fromJson(requestJson(status: 'device_delivery_pending')..['returnSchedule'] = null).returnSchedule, isNull);
    });

    test('a history step keeps the photos taken at it', () {
      final json = requestJson(status: 'repair_completed');
      json['statusHistory'] = <Object?>[...(json['statusHistory'] as List), {
        'status': 'repair_completed',
        'at': '2026-11-16T10:00:00.000Z',
        'note': 'Screen replaced and tested',
        'photos': [
          {'url': '/uploads/repair/done1.jpg'},
          {'url': '/uploads/repair/done2.jpg'},
        ],
      }];
      final steps = ServiceRequest.fromJson(json).history;
      expect(steps.first.photos, isEmpty);
      expect(steps.last.photos.map((p) => p.url), ['/uploads/repair/done1.jpg', '/uploads/repair/done2.jpg']);
    });

    test('an open request has no technician yet', () {
      final json = requestJson()..['technician'] = null;
      final r = ServiceRequest.fromJson(json);
      expect(r.technicianName, isNull);
      expect(r.technicianId, isNull);
    });
  });
}
