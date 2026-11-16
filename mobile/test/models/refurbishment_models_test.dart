import 'package:ewaste_opportunity/core/format.dart';
import 'package:ewaste_opportunity/core/refurbishment_validation.dart';
import 'package:ewaste_opportunity/models/refurbishment.dart';
import 'package:flutter_test/flutter_test.dart';

/// A device in the refurbisher's feed, as `GET /api/refurbishment/opportunities` sends it.
Map<String, dynamic> refurbOpportunityJson({String id = 'l1', bool hasOffered = false}) => {
      '_id': id,
      'title': 'Old Dell laptop',
      'brand': 'Dell',
      'model': 'Latitude',
      'condition': 'fully_working',
      'description': 'Scratches on the lid',
      'category': {'name': 'Laptops', 'slug': 'laptops'},
      'addressArea': 'Indiranagar',
      'city': 'Bengaluru',
      'device': {
        'photos': [
          {'url': '/uploads/devices/d.jpg', 'publicId': 'd'},
        ],
      },
      'preferredService': 'refurbishment',
      'listedAt': '2026-11-10T09:00:00.000Z',
      'hasOffered': hasOffered,
    };

/// A refurbishment job as the API sends it (the long form when [detail]).
Map<String, dynamic> refurbJobJson({
  String id = 'j1',
  String status = 'offered',
  String role = 'refurbisher',
  List<String> actions = const ['withdraw'],
  bool detail = true,
  double amount = 500,
  Map<String, dynamic>? pickup,
  bool ownerConfirmed = false,
  bool refurbisherConfirmed = false,
  List<String> photoStages = const [],
  String? nextStatus,
  List<Map<String, dynamic>> beforePhotos = const [],
  List<Map<String, dynamic>> afterPhotos = const [],
}) =>
    {
      '_id': id,
      'status': status,
      'offer': {'amount': amount, 'message': 'I can fix it in a week', 'status': 'pending'},
      'listing': refurbOpportunityJson(),
      'owner': {'_id': 'u1', 'name': 'Asha'},
      'refurbisher': {'_id': 'u2', 'name': 'Ravi', 'businessName': 'Ravi Refurbs', 'city': 'Bengaluru'},
      'viewerRole': role,
      'beforePhotos': beforePhotos,
      'afterPhotos': afterPhotos,
      'product': null,
      'updatedAt': '2026-11-11T09:00:00.000Z',
      if (detail) ...{
        'pickup': pickup,
        'confirmations': {'owner': ownerConfirmed, 'refurbisher': refurbisherConfirmed, 'checklistAcknowledged': ownerConfirmed},
        'workLog': [
          {'text': 'Replaced the battery', 'at': '2026-11-12T09:00:00.000Z'},
        ],
        'history': [
          {'status': 'offered', 'at': '2026-11-10T09:00:00.000Z', 'note': 'Offer made'},
        ],
        'actions': actions,
        if (role == 'refurbisher') ...{'photoStages': photoStages, 'nextStatus': nextStatus},
      },
    };

void main() {
  group('RefurbOpportunity', () {
    test('reads the device with only its public area', () {
      final o = RefurbOpportunity.fromJson(refurbOpportunityJson(hasOffered: true));
      expect(o.id, 'l1');
      expect(o.device.title, 'Old Dell laptop');
      expect(o.device.place, 'Indiranagar, Bengaluru');
      expect(o.device.photos.single.url, '/uploads/devices/d.jpg');
      expect(o.hasOffered, isTrue);
      expect(o.listedAt, isNotNull);
    });
  });

  group('RefurbJob', () {
    test('reads the offer, both sides and the viewer', () {
      final j = RefurbJob.fromJson(refurbJobJson());
      expect(j.id, 'j1');
      expect(j.status, 'offered');
      expect(j.offerAmount, 500);
      expect(j.offerMessage, 'I can fix it in a week');
      expect(j.ownerName, 'Asha');
      expect(j.refurbisherLabel, 'Ravi Refurbs');
      expect(j.isRefurbisherView, isTrue);
      expect(j.otherSideName, 'Asha');
      expect(j.can('withdraw'), isTrue);
      expect(j.can('cancel'), isFalse);
      expect(j.isFinished, isFalse);
    });

    test('the owner sees the refurbisher on the other side', () {
      final j = RefurbJob.fromJson(refurbJobJson(role: 'owner', actions: const ['decide', 'cancel']));
      expect(j.isOwnerView, isTrue);
      expect(j.otherSideName, 'Ravi Refurbs');
      expect(j.photoStages, isEmpty);
      expect(j.nextStatus, isNull);
    });

    test('falls back to the person name when there is no business name', () {
      final json = refurbJobJson();
      (json['refurbisher'] as Map<String, dynamic>).remove('businessName');
      expect(RefurbJob.fromJson(json).refurbisherLabel, 'Ravi');
    });

    test('reads the pickup, confirmations, work log, history and photo steps', () {
      final j = RefurbJob.fromJson(refurbJobJson(
        status: 'in_progress',
        actions: const ['advance', 'add_photos'],
        pickup: {'date': '2026-11-13T10:00:00.000Z', 'timeSlot': 'Morning', 'notes': 'Ring the bell', 'status': 'scheduled'},
        ownerConfirmed: true,
        refurbisherConfirmed: true,
        photoStages: const ['before', 'after'],
        nextStatus: 'testing',
        beforePhotos: [
          {'url': '/uploads/r/b.jpg', 'publicId': 'b'},
        ],
      ));
      expect(j.handover?.date, isNotNull);
      expect(j.handover?.timeSlot, 'Morning');
      expect(j.ownerConfirmed && j.refurbisherConfirmed, isTrue);
      expect(j.workLog.single.text, 'Replaced the battery');
      expect(j.history.single.status, 'offered');
      expect(j.photoStages, ['before', 'after']);
      expect(j.nextStatus, 'testing');
      expect(j.beforePhotos, hasLength(1));
      expect(j.afterPhotos, isEmpty);
    });

    test('a short list entry has no actions and no history', () {
      final j = RefurbJob.fromJson(refurbJobJson(detail: false));
      expect(j.actions, isEmpty);
      expect(j.history, isEmpty);
      expect(j.handover, isNull);
    });

    test('a listed or cancelled job is finished', () {
      expect(RefurbJob.fromJson(refurbJobJson(status: 'listed')).isFinished, isTrue);
      expect(RefurbJob.fromJson(refurbJobJson(status: 'cancelled')).isFinished, isTrue);
      expect(RefurbJob.fromJson(refurbJobJson(status: 'testing')).isFinished, isFalse);
    });
  });

  group('wording', () {
    test('each status has a label for each side', () {
      expect(refurbStatusLabel('in_progress'), 'Being refurbished');
      expect(refurbStatusLabel('offered'), 'Offer sent');
      expect(refurbStatusLabel('offered', owner: true), 'Offer received');
      expect(refurbStatusLabel('collected', owner: true), 'With the refurbisher');
      expect(refurbStatusLabel('mystery'), 'mystery');
      expect(refurbAdvanceLabels['ready_to_list'], 'Mark ready to sell');
    });
  });

  group('validation', () {
    test('an offer amount is optional but must be a sensible number', () {
      expect(validateOfferAmount(''), isNull);
      expect(validateOfferAmount(' 1,500.50 '), isNull);
      expect(validateOfferAmount('abc'), isNotNull);
      expect(validateOfferAmount('-5'), isNotNull);
      expect(validateOfferAmount('99999999'), isNotNull);
    });

    test('money is read from what people type', () {
      expect(parseMoney('₹ 1,200'), 1200);
      expect(parseMoney(''), isNull);
      expect(parseMoney('x'), isNull);
    });

    test('notes and messages are capped', () {
      expect(validateOfferMessage('a' * 1001), isNotNull);
      expect(validateOfferMessage('a' * 1000), isNull);
      expect(validateJobNote('a' * 501), isNotNull);
      expect(validateJobNote(null), isNull);
    });

    test('a product needs a title, a disclosure, a price and stock', () {
      expect(validateProductTitle('ab'), isNotNull);
      expect(validateProductTitle('Dell laptop'), isNull);
      expect(validateRefurbishmentInfo('short'), isNotNull);
      expect(validateRefurbishmentInfo('New battery and SSD fitted, fully tested'), isNull);
      expect(validateProductPrice(''), isNotNull);
      expect(validateProductPrice('-1'), isNotNull);
      expect(validateProductPrice('8999'), isNull);
      expect(stockValidator(allowZero: false)('0'), isNotNull);
      expect(stockValidator(allowZero: true)('0'), isNull);
      expect(stockValidator(allowZero: true)('1000'), isNotNull);
      expect(stockValidator(allowZero: false)('abc'), isNotNull);
    });

    test('specifications are read one per line', () {
      final ok = parseSpecs('RAM: 8 GB\nStorage: 256 GB SSD\n');
      expect(ok.error, isNull);
      expect(ok.specs, {'RAM': '8 GB', 'Storage': '256 GB SSD'});
      expect(parseSpecs('no colon here').error, isNotNull);
      expect(parseSpecs('RAM:').error, isNotNull);
      expect(parseSpecs('${'k' * 41}: v').error, isNotNull);
      expect(parseSpecs('').specs, isEmpty);
      expect(validateSpecs('a: 1'), isNull);
      expect(specsToText({'RAM': '8 GB'}), 'RAM: 8 GB');
    });
  });
}
