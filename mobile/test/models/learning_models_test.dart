import 'package:ewaste_opportunity/core/format.dart';
import 'package:ewaste_opportunity/core/learning_validation.dart';
import 'package:ewaste_opportunity/models/learning.dart';
import 'package:flutter_test/flutter_test.dart';

/// An opportunity as `GET /api/students/opportunities` sends it to a student.
Map<String, dynamic> opportunityJson({String id = 'o1', String? applyBlock, Map<String, dynamic>? myApplication, String? viewerRole = 'student', int seatsLeft = 2, String status = 'open'}) => {
      '_id': id,
      'title': 'Replace a phone battery',
      'description': 'Learn to open and test a phone safely',
      'deviceType': {'_id': 'c1', 'name': 'Phones', 'slug': 'phones'},
      'requiredSkills': ['soldering', 'testing'],
      'difficulty': 'beginner',
      'locationArea': 'Indiranagar',
      'deadline': '2026-12-20T10:00:00.000Z',
      'seats': 3,
      'seatsTaken': 3 - seatsLeft,
      'seatsLeft': seatsLeft,
      'expectedHours': 4,
      'status': status,
      'supervised': true,
      'hazardousExcluded': true,
      'supervisor': {'_id': 't1', 'name': 'Ravi Kumar', 'headline': 'Phone repair for ten years', 'city': 'Bengaluru', 'ratingAvg': 4.8, 'ratingCount': 12},
      'viewerRole': viewerRole,
      if (viewerRole == 'student') ...{'myApplication': myApplication, 'applyBlock': applyBlock},
    };

/// An application as `GET /api/students/applications` sends it to a student.
Map<String, dynamic> applicationJson({String id = 'a1', String status = 'applied', List<String> actions = const ['withdraw'], double hours = 0, String? feedback, String? certificate}) => {
      '_id': id,
      'status': status,
      'message': 'I like fixing phones',
      'supervisorFeedback': feedback,
      'hours': hours,
      'startedAt': status == 'in_progress' || status == 'completed' ? '2026-12-01T10:00:00.000Z' : null,
      'completedAt': status == 'completed' ? '2026-12-02T10:00:00.000Z' : null,
      'createdAt': '2026-11-20T10:00:00.000Z',
      'viewerRole': 'student',
      'actions': actions,
      'opportunity': {
        '_id': 'o1',
        'title': 'Replace a phone battery',
        'difficulty': 'beginner',
        'deadline': '2026-12-20T10:00:00.000Z',
        'locationArea': 'Indiranagar',
        'status': 'open',
        'requiredSkills': ['testing'],
        'deviceType': {'name': 'Phones', 'slug': 'phones'},
        'supervisor': {'_id': 't1', 'name': 'Ravi Kumar'},
      },
      'certificate': certificate,
      'history': [
        {'status': 'applied', 'at': '2026-11-20T10:00:00.000Z', 'note': null},
      ],
    };

void main() {
  group('Opportunity', () {
    test('reads the task, its supervisor and the places left', () {
      final o = Opportunity.fromJson(opportunityJson());
      expect(o.title, 'Replace a phone battery');
      expect(o.categoryName, 'Phones');
      expect(o.skills, ['soldering', 'testing']);
      expect(o.seatsLeft, 2);
      expect(o.expectedHours, 4);
      expect(o.supervisorName, 'Ravi Kumar');
      expect(o.hasSupervisorRating, isTrue);
      expect(o.isStudentView, isTrue);
      expect(o.canApply, isTrue);
    });

    test('cannot be applied to when the server says why', () {
      final o = Opportunity.fromJson(opportunityJson(applyBlock: 'not_verified'));
      expect(o.applyBlock, 'not_verified');
      expect(o.canApply, isFalse);
      expect(applyBlockMessages['not_verified'], contains('verified'));
    });

    test('an application already sent is carried on the task', () {
      final o = Opportunity.fromJson(opportunityJson(applyBlock: 'already_applied', myApplication: {'_id': 'a1', 'status': 'accepted'}));
      expect(o.myApplication?.id, 'a1');
      expect(o.myApplication?.status, 'accepted');
      expect(o.canApply, isFalse);
    });

    test('someone who is not a student cannot apply', () {
      final o = Opportunity.fromJson(opportunityJson(viewerRole: null));
      expect(o.isStudentView, isFalse);
      expect(o.canApply, isFalse);
    });
  });

  group('Application', () {
    test('reads the task, the supervisor, the history and what the student can do', () {
      final a = Application.fromJson(applicationJson());
      expect(a.opportunityTitle, 'Replace a phone battery');
      expect(a.supervisorName, 'Ravi Kumar');
      expect(a.categoryName, 'Phones');
      expect(a.history.single.status, 'applied');
      expect(a.can('withdraw'), isTrue);
      expect(a.isFinished, isFalse);
    });

    test('a completed one has hours, feedback and a certificate number', () {
      final a = Application.fromJson(applicationJson(status: 'completed', actions: const [], hours: 3.5, feedback: 'Careful work', certificate: 'CERT-2026-AB12CD'));
      expect(a.hours, 3.5);
      expect(a.supervisorFeedback, 'Careful work');
      expect(a.certificate, 'CERT-2026-AB12CD');
      expect(a.completedAt, isNotNull);
      expect(a.isFinished, isTrue);
    });

    test('rejected and withdrawn applications are finished', () {
      expect(Application.fromJson(applicationJson(status: 'rejected', actions: const [])).isFinished, isTrue);
      expect(Application.fromJson(applicationJson(status: 'withdrawn', actions: const [])).isFinished, isTrue);
    });
  });

  group('experience and certificates', () {
    test('the experience carries totals, skills and each completed task', () {
      final x = Experience.fromJson({
        'summary': {'completedCount': 2, 'totalHours': 7.5, 'skills': ['testing'], 'college': 'NIT', 'course': 'ECE', 'yearOfStudy': 3},
        'items': [applicationJson(status: 'completed', actions: const [], hours: 3.5)],
      });
      expect(x.summary.completedCount, 2);
      expect(x.summary.totalHours, 7.5);
      expect(x.summary.college, 'NIT');
      expect(x.items.single.hours, 3.5);
    });

    test('a missing summary is empty rather than an error', () {
      final x = Experience.fromJson(const {});
      expect(x.summary.completedCount, 0);
      expect(x.items, isEmpty);
    });

    test('a certificate names the task and the hours', () {
      final c = Certificate.fromJson({
        '_id': 'c1',
        'certNo': 'CERT-2026-AB12CD',
        'issuedAt': '2026-12-05T10:00:00.000Z',
        'application': {'_id': 'a1', 'hours': 3.5, 'completedAt': '2026-12-02T10:00:00.000Z', 'opportunity': {'_id': 'o1', 'title': 'Replace a phone battery'}},
      });
      expect(c.certNo, 'CERT-2026-AB12CD');
      expect(c.taskTitle, 'Replace a phone battery');
      expect(c.hours, 3.5);
    });
  });

  group('labels and validation', () {
    test('application statuses are worded for the student', () {
      expect(applicationStatusLabel('applied'), 'Waiting for review');
      expect(applicationStatusLabel('rejected'), 'Not selected');
      expect(applicationStatusLabel('new_thing'), 'new_thing');
      expect(labelOf(difficulties, 'intermediate'), 'Intermediate');
    });

    test('hours read naturally', () {
      expect(formatHours(1), '1 hour');
      expect(formatHours(2), '2 hours');
      expect(formatHours(1.5), '1.5 hours');
      expect(formatHours(0), '0 hours');
    });

    test('the note is optional but limited', () {
      expect(validateApplicationMessage(null), isNull);
      expect(validateApplicationMessage('I want to learn'), isNull);
      expect(validateApplicationMessage('x' * 501), isNotNull);
    });
  });
}
