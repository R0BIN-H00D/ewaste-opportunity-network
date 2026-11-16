import 'package:ewaste_opportunity/core/learning_validation.dart';
import 'package:ewaste_opportunity/models/learning.dart';
import 'package:ewaste_opportunity/models/recycling_report.dart';
import 'package:flutter_test/flutter_test.dart';
import 'learning_models_test.dart';

/// The recycling centre's report as `GET /api/recycling-requests/report` sends it.
Map<String, dynamic> reportJson({bool empty = false}) => {
      'center': 'GreenCycle Recyclers',
      'range': {'from': '2026-11-01T00:00:00.000Z', 'to': null},
      'requests': {
        'total': empty ? 0 : 7,
        'byStatus': empty ? <String, dynamic>{} : {'requested': 2, 'completed': 4, 'rejected': 1, 'cancelled': 0},
      },
      'completed': {'count': empty ? 0 : 4, 'devices': empty ? 0 : 9},
      'materials': [
        {'type': 'copper', 'actualKg': empty ? 0 : 3.25, 'estimatedKg': empty ? 0 : 1.5},
        {'type': 'aluminium', 'actualKg': 0, 'estimatedKg': empty ? 0 : 2},
        {'type': 'iron', 'actualKg': 0, 'estimatedKg': 0},
      ],
      'totals': {'actualKg': empty ? 0 : 3.25, 'estimatedKg': empty ? 0 : 3.5},
      'byCategory': empty
          ? <Object>[]
          : [
              {'category': {'_id': 'c1', 'name': 'Phones', 'slug': 'phones'}, 'requests': 3, 'devices': 5},
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
  group('a task seen by its supervisor', () {
    test('reads the applicant counts and the category id', () {
      final o = Opportunity.fromJson({
        ...opportunityJson(viewerRole: 'supervisor'),
        'deviceType': {'_id': 'c9', 'name': 'Phones', 'slug': 'phones'},
        'counts': {'applied': 2, 'accepted': 1, 'rejected': 0},
      });
      expect(o.isSupervisorView, isTrue);
      expect(o.isStudentView, isFalse);
      expect(o.pendingApplicants, 2);
      expect(o.counts['accepted'], 1);
      expect(o.categoryId, 'c9');
    });

    test('a student view has no counts', () {
      final o = Opportunity.fromJson(opportunityJson());
      expect(o.counts, isEmpty);
      expect(o.pendingApplicants, 0);
    });
  });

  group('an application seen by its supervisor', () {
    test('reads the student and what the supervisor may do', () {
      final a = Application.fromJson({
        ...applicationJson(actions: const ['accept', 'reject']),
        'viewerRole': 'supervisor',
        'student': {'_id': 's1', 'name': 'Priya', 'college': 'NIT Trichy', 'course': 'ECE', 'yearOfStudy': 3, 'hoursCompleted': 6.5, 'skills': ['testing']},
      });
      expect(a.isSupervisorView, isTrue);
      expect(a.studentName, 'Priya');
      expect(a.student.college, 'NIT Trichy');
      expect(a.student.yearOfStudy, 3);
      expect(a.student.totalHours, 6.5);
      expect(a.student.skills, ['testing']);
      expect(a.can('accept'), isTrue);
      expect(a.can('withdraw'), isFalse);
    });

    test('a student\'s own application is a student view', () {
      expect(Application.fromJson(applicationJson()).isSupervisorView, isFalse);
    });
  });

  group('task validation', () {
    test('title, area and seats', () {
      expect(validateTaskTitle('abc'), isNotNull);
      expect(validateTaskTitle('Replace a phone battery'), isNull);
      expect(validateTaskTitle('a' * 141), isNotNull);
      expect(validateTaskArea('x'), isNotNull);
      expect(validateTaskArea('Indiranagar'), isNull);
      expect(validateSeats('0'), isNotNull);
      expect(validateSeats('21'), isNotNull);
      expect(validateSeats('abc'), isNotNull);
      expect(validateSeats('3'), isNull);
      expect(validateTaskDescription('a' * 2001), isNotNull);
    });

    test('expected hours are optional, hours worked are not', () {
      expect(validateExpectedHours(''), isNull);
      expect(validateExpectedHours('0'), isNotNull);
      expect(validateExpectedHours('201'), isNotNull);
      expect(validateExpectedHours('4.5'), isNull);
      expect(validateHoursWorked(''), isNotNull);
      expect(validateHoursWorked('0.25'), isNotNull);
      expect(validateHoursWorked('201'), isNotNull);
      expect(validateHoursWorked('3.5'), isNull);
      expect(validateFeedback('a' * 1001), isNotNull);
    });

    test('skills are lower-cased, de-duplicated and capped', () {
      expect(parseSkills('Soldering, testing, soldering,  ').skills, ['soldering', 'testing']);
      expect(parseSkills('').skills, isEmpty);
      expect(parseSkills(List.generate(11, (i) => 's$i').join(',')).error, isNotNull);
      expect(parseSkills('k' * 41).error, isNotNull);
      expect(validateSkills('a, b'), isNull);
    });
  });

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

    test('measured and estimated stay apart, and empty materials are left out', () {
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
