import 'package:ewaste_opportunity/core/donation_validation.dart';
import 'package:ewaste_opportunity/core/format.dart';
import 'package:ewaste_opportunity/models/donation.dart';
import 'package:flutter_test/flutter_test.dart';

/// A donation as `GET /api/donations` (short form) or `/:id` (with [detail]) sends it.
Map<String, dynamic> donationJson({
  String id = 'd1',
  String status = 'open',
  String role = 'visitor',
  List<String> actions = const [],
  bool detail = true,
  int? pendingRequests,
  Map<String, dynamic>? myRequest,
  List<Map<String, dynamic>> requests = const [],
  bool withRecipient = false,
  Map<String, dynamic>? pickup,
  bool donorConfirmed = false,
  bool recipientConfirmed = false,
  String? cancelReason,
  String? refNo,
}) =>
    {
      '_id': id,
      'status': status,
      'description': 'Works well, charger included',
      'listing': {
        '_id': 'l1',
        'title': 'Old Dell laptop',
        'brand': 'Dell',
        'model': 'Latitude',
        'condition': 'fully_working',
        'description': 'Some scratches on the lid',
        'category': {'name': 'Laptops', 'slug': 'laptops'},
        'addressArea': 'Indiranagar',
        'city': 'Bengaluru',
        'device': {
          'photos': [
            {'url': '/uploads/devices/d.jpg', 'publicId': 'd'},
          ],
        },
      },
      'donor': {'_id': 'u2', 'name': 'Ravi K.'},
      'viewerRole': role,
      'myRequest': myRequest,
      'createdAt': '2026-11-10T09:00:00.000Z',
      if (pendingRequests != null) 'pendingRequests': pendingRequests,
      if (detail) ...{
        if (withRecipient) 'recipient': {'_id': 'u3', 'name': 'Meena', 'orgName': 'Sunrise School', 'orgType': 'school'},
        if (pickup != null) 'pickup': pickup,
        'confirmations': {'donor': donorConfirmed, 'recipient': recipientConfirmed, 'checklistAcknowledged': donorConfirmed},
        'history': [
          {'status': 'open', 'at': '2026-11-10T09:00:00.000Z', 'note': 'Donation offered'},
        ],
        if (cancelReason != null) 'cancelReason': cancelReason,
        if (refNo != null) 'confirmation': {'refNo': refNo, 'issuedAt': '2026-11-14T09:00:00.000Z'},
        if (requests.isNotEmpty) 'requests': requests,
        'actions': actions,
      },
    };

Map<String, dynamic> requestRowJson({String id = 'r1', String status = 'pending', String name = 'Meena', String? org = 'Sunrise School'}) => {
      '_id': id,
      'status': status,
      'justification': 'We are setting up a computer lab for 30 students',
      'intendedUse': 'Teaching typing',
      'requester': {'_id': 'u3', 'name': name, if (org != null) ...{'orgName': org, 'orgType': 'school'}},
      'createdAt': '2026-11-11T09:00:00.000Z',
    };

void main() {
  group('Donation', () {
    test('reads the short form: the device, its public place and the donor', () {
      final d = Donation.fromJson(donationJson(detail: false));
      expect(d.device.title, 'Old Dell laptop');
      expect(d.device.subtitle, 'Laptops · Dell · Latitude');
      expect(d.device.place, 'Indiranagar, Bengaluru');
      expect(d.device.photos.single.url, '/uploads/devices/d.jpg');
      expect(d.donorName, 'Ravi K.');
      expect(d.viewerRole, 'visitor');
      expect(d.actions, isEmpty);
      expect(d.history, isEmpty);
      expect(d.isFinished, isFalse);
    });

    test('the donor sees how many requests wait, with who asked', () {
      final d = Donation.fromJson(donationJson(role: 'donor', status: 'requested', pendingRequests: 2, requests: [requestRowJson(), requestRowJson(id: 'r2', name: 'Kiran', org: null)], actions: ['decide', 'cancel']));
      expect(d.isDonorView, isTrue);
      expect(d.pendingRequests, 2);
      expect(d.requests.map((r) => r.title), ['Sunrise School', 'Kiran']); // the organisation when there is one
      expect(d.requests.first.isPending, isTrue);
      expect(d.can('decide'), isTrue);
      expect(d.can('request'), isFalse);
    });

    test('a person who asked sees their own request', () {
      final d = Donation.fromJson(donationJson(role: 'requester', myRequest: {'_id': 'r1', 'status': 'pending', 'justification': 'For our lab', 'intendedUse': null}));
      expect(d.myRequest?.status, 'pending');
      expect(d.myRequest?.justification, 'For our lab');
    });

    test('a participant sees the other side, the handover and who has confirmed', () {
      final d = Donation.fromJson(donationJson(
        role: 'donor',
        status: 'handover_scheduled',
        withRecipient: true,
        pickup: {'date': '2026-11-20T10:00:00.000Z', 'timeSlot': 'Morning', 'notes': 'Gate 2', 'status': 'confirmed'},
        donorConfirmed: true,
        actions: ['confirm_handover'],
      ));
      expect(d.recipientOrg, 'Sunrise School');
      expect(d.otherSideName, 'Sunrise School');
      expect(d.handover?.timeSlot, 'Morning');
      expect(d.donorConfirmed, isTrue);
      expect(d.recipientConfirmed, isFalse);
    });

    test('for the recipient the other side is the donor', () {
      final d = Donation.fromJson(donationJson(role: 'recipient', status: 'accepted', withRecipient: true));
      expect(d.isRecipientView, isTrue);
      expect(d.otherSideName, 'Ravi K.');
    });

    test('a finished donation reads its reference and cancel reason', () {
      final done = Donation.fromJson(donationJson(role: 'donor', status: 'completed', refNo: 'DON-2026-0001'));
      expect(done.refNo, 'DON-2026-0001');
      expect(done.isFinished, isTrue);
      final cancelled = Donation.fromJson(donationJson(status: 'cancelled', cancelReason: 'Changed my mind'));
      expect(cancelled.cancelReason, 'Changed my mind');
      expect(cancelled.isFinished, isTrue);
    });

    test('missing fields fall back to safe values', () {
      final d = Donation.fromJson(const {'_id': 'x'});
      expect(d.status, 'open');
      expect(d.device.title, 'Device');
      expect(d.device.photos, isEmpty);
      expect(d.requests, isEmpty);
    });
  });

  group('other records', () {
    test('the confirmation says who gave what to whom', () {
      final c = DonationConfirmation.fromJson(const {
        'refNo': 'DON-2026-0001',
        'issuedAt': '2026-11-14T09:00:00.000Z',
        'device': {'title': 'Old Dell laptop'},
        'donor': {'name': 'Ravi Kumar'},
        'recipient': {'name': 'Meena', 'orgName': 'Sunrise School'},
        'handoverDate': '2026-11-20T10:00:00.000Z',
        'statement': 'No payment was made or processed.',
      });
      expect(c.refNo, 'DON-2026-0001');
      expect(c.recipientOrg, 'Sunrise School');
      expect(c.statement, contains('No payment'));
    });

    test('the recipient status knows when it is approved or waiting', () {
      expect(RecipientStatus.fromJson(const {'status': 'approved', 'isOrg': true}).isApproved, isTrue);
      expect(RecipientStatus.fromJson(const {'status': 'pending'}).isPending, isTrue);
      expect(RecipientStatus.fromJson(const {}).status, 'not_submitted');
    });
  });

  group('labels and validation', () {
    test('donation statuses have a viewer-specific wording', () {
      expect(donationStatusLabel('requested'), 'Requests received');
      expect(donationStatusLabel('requested', recipient: true), 'Waiting for the donor');
      expect(donationStatusLabel('accepted', recipient: true), 'You were chosen');
      expect(donationStatusLabel('completed', recipient: true), 'Completed');
      expect(donationStatusLabel('new_thing'), 'new_thing');
    });

    test('organisation kinds are labelled', () {
      expect(labelOf(orgTypes, 'ngo'), 'NGO');
    });

    test('a request needs a real reason, and an organisation needs a name and a number', () {
      expect(validateJustification('Need it'), isNotNull);
      expect(validateJustification('We run a computer lab for students'), isNull);
      expect(validateJustification('x' * 1001), isNotNull);
      expect(validateIntendedUse('x' * 501), isNotNull);
      expect(validateOrgName('A'), isNotNull);
      expect(validateOrgName('Sunrise School'), isNull);
      expect(validateRegistrationNo('12'), isNotNull);
      expect(validateRegistrationNo('REG-123'), isNull);
      expect(validateDonationNote('x' * 1001), isNotNull);
    });
  });
}
