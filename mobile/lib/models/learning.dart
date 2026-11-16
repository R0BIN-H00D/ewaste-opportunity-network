DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v) : null;
Map<String, dynamic> _map(Object? v) => v is Map ? v.cast<String, dynamic>() : const <String, dynamic>{};
List<String> _strings(Object? v) => v is List ? [for (final s in v) if (s is String) s] : const [];

/// The student's own application on an opportunity, as the opportunity page shows it.
class MyApplicationRef {
  const MyApplicationRef({required this.id, required this.status});

  final String id;
  final String status;
}

/// A supervised learning task a verified technician posted. Hazardous work is always excluded (BR-07).
class Opportunity {
  const Opportunity({
    required this.id,
    required this.title,
    required this.difficulty,
    required this.locationArea,
    this.description,
    this.categoryName,
    this.categoryId,
    this.skills = const [],
    this.deadline,
    this.seats = 1,
    this.seatsTaken = 0,
    this.seatsLeft = 0,
    this.expectedHours,
    this.status = 'open',
    this.supervisorName,
    this.supervisorHeadline,
    this.supervisorCity,
    this.supervisorRating = 0,
    this.supervisorRatingCount = 0,
    this.myApplication,
    this.applyBlock,
    this.viewerRole,
    this.counts = const {},
  });

  final String id;
  final String title;
  final String difficulty;
  final String locationArea;
  final String? description;
  final String? categoryName;
  final String? categoryId;
  final List<String> skills;
  final DateTime? deadline;
  final int seats;
  final int seatsTaken;
  final int seatsLeft;
  final double? expectedHours;
  final String status;
  final String? supervisorName;
  final String? supervisorHeadline;
  final String? supervisorCity;
  final double supervisorRating;
  final int supervisorRatingCount;
  final MyApplicationRef? myApplication;

  /// Why this student cannot apply right now (`not_verified`, `already_applied`, `closed`, `filled`, `deadline_passed`), or null when they can.
  final String? applyBlock;

  /// `student`, `supervisor`, `admin`, or null for someone who is not signed in.
  final String? viewerRole;

  /// Applications by status, for the supervisor and the administrator.
  final Map<String, int> counts;

  bool get isSupervisorView => viewerRole == 'supervisor';
  int get pendingApplicants => counts['applied'] ?? 0;
  bool get isStudentView => viewerRole == 'student';
  bool get canApply => isStudentView && applyBlock == null && myApplication == null;
  bool get hasSupervisorRating => supervisorRatingCount > 0;

  factory Opportunity.fromJson(Map<String, dynamic> json) {
    final supervisor = _map(json['supervisor']);
    final mine = json['myApplication'];
    return Opportunity(
      id: json['_id'] as String,
      title: (json['title'] as String?) ?? 'Task',
      difficulty: (json['difficulty'] as String?) ?? 'beginner',
      locationArea: (json['locationArea'] as String?) ?? '',
      description: json['description'] as String?,
      categoryName: _map(json['deviceType'])['name'] as String?,
      categoryId: _map(json['deviceType'])['_id'] as String?,
      skills: _strings(json['requiredSkills']),
      deadline: _date(json['deadline']),
      seats: (json['seats'] as num?)?.toInt() ?? 1,
      seatsTaken: (json['seatsTaken'] as num?)?.toInt() ?? 0,
      seatsLeft: (json['seatsLeft'] as num?)?.toInt() ?? 0,
      expectedHours: (json['expectedHours'] as num?)?.toDouble(),
      status: (json['status'] as String?) ?? 'open',
      supervisorName: supervisor['name'] as String?,
      supervisorHeadline: supervisor['headline'] as String?,
      supervisorCity: supervisor['city'] as String?,
      supervisorRating: (supervisor['ratingAvg'] as num?)?.toDouble() ?? 0,
      supervisorRatingCount: (supervisor['ratingCount'] as num?)?.toInt() ?? 0,
      myApplication: mine is Map ? MyApplicationRef(id: (mine['_id'] as String?) ?? '', status: (mine['status'] as String?) ?? 'applied') : null,
      applyBlock: json['applyBlock'] as String?,
      viewerRole: json['viewerRole'] as String?,
      counts: {for (final e in _map(json['counts']).entries) if (e.value is num) e.key: (e.value as num).toInt()},
    );
  }
}

class ApplicationStep {
  const ApplicationStep({required this.status, this.at, this.note});

  final String status;
  final DateTime? at;
  final String? note;

  factory ApplicationStep.fromJson(Map<String, dynamic> json) => ApplicationStep(status: (json['status'] as String?) ?? '', at: _date(json['at']), note: json['note'] as String?);
}

/// A student's application to one opportunity. The supervising technician decides, starts and completes it; the student can withdraw.
class Application {
  const Application({
    required this.id,
    required this.status,
    required this.opportunityId,
    required this.opportunityTitle,
    this.message,
    this.supervisorFeedback,
    this.hours = 0,
    this.startedAt,
    this.completedAt,
    this.createdAt,
    this.updatedAt,
    this.difficulty,
    this.deadline,
    this.locationArea,
    this.categoryName,
    this.skills = const [],
    this.supervisorName,
    this.certificate,
    this.history = const [],
    this.actions = const [],
    this.viewerRole = 'student',
    this.studentName,
    this.student = const StudentSummary(),
  });

  final String id;
  final String status;
  final String opportunityId;
  final String opportunityTitle;
  final String? message;
  final String? supervisorFeedback;
  final double hours;
  final DateTime? startedAt;
  final DateTime? completedAt;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String? difficulty;
  final DateTime? deadline;
  final String? locationArea;
  final String? categoryName;
  final List<String> skills;
  final String? supervisorName;

  /// The certificate number once an administrator has issued one.
  final String? certificate;
  final List<ApplicationStep> history;
  final List<String> actions;

  /// `student`, `supervisor` or `admin`.
  final String viewerRole;

  /// The student's name and what the supervisor may see of them: college, course, year, hours and skills. Never contact details.
  final String? studentName;
  final StudentSummary student;

  bool get isSupervisorView => viewerRole == 'supervisor';
  bool get isFinished => status == 'completed' || status == 'rejected' || status == 'withdrawn';
  bool can(String action) => actions.contains(action);

  factory Application.fromJson(Map<String, dynamic> json) {
    final opp = _map(json['opportunity']);
    final history = json['history'];
    return Application(
      id: json['_id'] as String,
      status: (json['status'] as String?) ?? 'applied',
      opportunityId: (opp['_id'] as String?) ?? '',
      opportunityTitle: (opp['title'] as String?) ?? 'Task',
      message: json['message'] as String?,
      supervisorFeedback: json['supervisorFeedback'] as String?,
      hours: (json['hours'] as num?)?.toDouble() ?? 0,
      startedAt: _date(json['startedAt']),
      completedAt: _date(json['completedAt']),
      createdAt: _date(json['createdAt']),
      updatedAt: _date(json['updatedAt']),
      difficulty: opp['difficulty'] as String?,
      deadline: _date(opp['deadline']),
      locationArea: opp['locationArea'] as String?,
      categoryName: _map(opp['deviceType'])['name'] as String?,
      skills: _strings(opp['requiredSkills']),
      supervisorName: _map(opp['supervisor'])['name'] as String?,
      certificate: json['certificate'] is String ? json['certificate'] as String : null,
      history: history is List ? [for (final h in history) if (h is Map) ApplicationStep.fromJson(h.cast<String, dynamic>())] : const [],
      actions: _strings(json['actions']),
      viewerRole: (json['viewerRole'] as String?) ?? 'student',
      studentName: _map(json['student'])['name'] as String?,
      student: StudentSummary.fromJson({
        ..._map(json['student']),
        'totalHours': _map(json['student'])['hoursCompleted'],
      }),
    );
  }
}

class StudentSummary {
  const StudentSummary({this.completedCount = 0, this.totalHours = 0, this.skills = const [], this.college, this.course, this.yearOfStudy});

  final int completedCount;
  final double totalHours;
  final List<String> skills;
  final String? college;
  final String? course;
  final int? yearOfStudy;

  factory StudentSummary.fromJson(Map<String, dynamic> json) => StudentSummary(
        completedCount: (json['completedCount'] as num?)?.toInt() ?? 0,
        totalHours: (json['totalHours'] as num?)?.toDouble() ?? 0,
        skills: _strings(json['skills']),
        college: json['college'] as String?,
        course: json['course'] as String?,
        yearOfStudy: (json['yearOfStudy'] as num?)?.toInt(),
      );
}

/// What a student has finished: totals, and each completed task.
class Experience {
  const Experience({required this.summary, this.items = const []});

  final StudentSummary summary;
  final List<Application> items;

  factory Experience.fromJson(Map<String, dynamic> json) {
    final items = json['items'];
    return Experience(
      summary: StudentSummary.fromJson(_map(json['summary'])),
      items: items is List ? [for (final i in items) if (i is Map) Application.fromJson(i.cast<String, dynamic>())] : const [],
    );
  }
}

/// A participation certificate an administrator issued after a task was completed.
class Certificate {
  const Certificate({required this.id, required this.certNo, this.issuedAt, this.taskTitle, this.hours = 0, this.completedAt});

  final String id;
  final String certNo;
  final DateTime? issuedAt;
  final String? taskTitle;
  final double hours;
  final DateTime? completedAt;

  factory Certificate.fromJson(Map<String, dynamic> json) {
    final app = _map(json['application']);
    return Certificate(
      id: (json['_id'] as String?) ?? '',
      certNo: (json['certNo'] as String?) ?? '',
      issuedAt: _date(json['issuedAt']),
      taskTitle: _map(app['opportunity'])['title'] as String?,
      hours: (app['hours'] as num?)?.toDouble() ?? 0,
      completedAt: _date(app['completedAt']),
    );
  }
}
