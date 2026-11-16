import 'package:ewaste_opportunity/core/format.dart';
import 'package:ewaste_opportunity/core/request_validation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
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
