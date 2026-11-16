import 'package:ewaste_opportunity/core/format.dart';
import 'package:ewaste_opportunity/core/request_validation.dart';
import 'package:ewaste_opportunity/screens/requests/technician_forms.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('the quote form', () {
    test('money is a number from 0 up to the server\'s limit', () {
      expect(validateMoney(''), 'Enter an amount');
      expect(validateMoney('  ', empty: 'Amount'), 'Amount');
      expect(validateMoney('abc'), isNotNull);
      expect(validateMoney('-5'), isNotNull);
      expect(validateMoney('10000001'), isNotNull);
      expect(validateMoney('0'), isNull);
      expect(validateMoney('2499.50'), isNull);
      expect(validateMoney('10000000'), isNull);
    });

    test('days needed is optional, whole and at most a year', () {
      expect(validateDays(''), isNull);
      expect(validateDays('3'), isNull);
      expect(validateDays('365'), isNull);
      expect(validateDays('366'), isNotNull);
      expect(validateDays('1.5'), isNotNull);
      expect(validateDays('-1'), isNotNull);
    });

    test('an offer stays open for 1 to 90 days', () {
      expect(validateOfferDays('7'), isNull);
      expect(validateOfferDays('1'), isNull);
      expect(validateOfferDays('90'), isNull);
      expect(validateOfferDays('0'), isNotNull);
      expect(validateOfferDays('91'), isNotNull);
      expect(validateOfferDays(''), isNotNull);
    });
  });

  group('validateIssue', () {
    test('needs something to be written', () {
      expect(validateIssue(null), isNotNull);
      expect(validateIssue('   '), isNotNull);
      expect(validateIssue('ab'), contains('few words'));
    });

    test('accepts a normal description and refuses a huge one', () {
      expect(validateIssue('Screen is cracked'), isNull);
      expect(validateIssue('x' * 2001), isNotNull);
    });
  });

  group('validateDeclineReason', () {
    test('a reason of at least three characters is required', () {
      expect(validateDeclineReason(''), isNotNull);
      expect(validateDeclineReason('no'), isNotNull);
      expect(validateDeclineReason('too costly'), isNull);
    });
  });

  group('formatting', () {
    test('dates read as day, month name and year', () {
      expect(formatDate(DateTime(2026, 11, 16)), '16 Nov 2026');
      expect(formatDate(null), '');
    });

    test('times use a 12 hour clock', () {
      expect(formatDateTime(DateTime(2026, 11, 16, 15, 5)), '16 Nov 2026, 3:05 PM');
      expect(formatDateTime(DateTime(2026, 11, 16, 0, 30)), '16 Nov 2026, 12:30 AM');
      expect(formatDateTime(DateTime(2026, 11, 16, 12, 0)), '16 Nov 2026, 12:00 PM');
    });

    test('every status the server can send has a label', () {
      const statuses = [
        'request_submitted', 'technician_assigned', 'device_collection_pending', 'device_collected', 'diagnosis_in_progress',
        'quotation_submitted', 'customer_approval_pending', 'repair_in_progress', 'repair_completed', 'device_delivery_pending',
        'device_delivered', 'service_completed', 'rejected', 'cancelled',
      ];
      for (final s in statuses) {
        expect(requestStatusLabels[s], isNotNull, reason: s);
      }
    });
  });
}
