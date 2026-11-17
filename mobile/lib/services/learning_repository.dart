import 'dart:typed_data';
import 'package:dio/dio.dart';
import '../core/network/api_exception.dart';
import '../models/learning.dart';
import '../models/page_result.dart';
import 'api_client.dart';

/// What to ask `GET /api/students/opportunities` for. Empty values are left out, because the server refuses parameters it does not know (422).
class OpportunityQuery {
  const OpportunityQuery({this.q = '', this.difficulty = '', this.category = '', this.page = 1, this.limit = 12});

  final String q;
  final String difficulty;

  /// A category slug, or empty for any.
  final String category;
  final int page;
  final int limit;

  int get activeFilters => [difficulty, category].where((v) => v.isNotEmpty).length;

  OpportunityQuery copyWith({String? q, String? difficulty, String? category, int? page}) =>
      OpportunityQuery(q: q ?? this.q, difficulty: difficulty ?? this.difficulty, category: category ?? this.category, page: page ?? this.page, limit: limit);

  Map<String, dynamic> toParams() => {
        'page': page,
        'limit': limit,
        if (q.trim().isNotEmpty) 'q': q.trim(),
        if (difficulty.isNotEmpty) 'difficulty': difficulty,
        if (category.isNotEmpty) 'category': category,
      };
}

/// What a supervising technician sends to post or change a task.
class OpportunityInput {
  const OpportunityInput({
    this.title,
    this.description,
    this.deviceTypeId,
    this.requiredSkills,
    this.difficulty,
    this.locationArea,
    this.deadline,
    this.seats,
    this.expectedHours,
    this.supervisionAcknowledged = false,
  });

  final String? title;
  final String? description;
  final String? deviceTypeId;
  final List<String>? requiredSkills;
  final String? difficulty;
  final String? locationArea;
  final DateTime? deadline;
  final int? seats;
  final double? expectedHours;

  /// The technician agrees to supervise throughout and that no hazardous handling is included (BR-07). Needed to post, not to edit.
  final bool supervisionAcknowledged;

  Map<String, dynamic> toJson({required bool creating}) => {
        if (title != null) 'title': title!.trim(),
        if (description != null && (description!.trim().isNotEmpty || !creating)) 'description': description!.trim(),
        if (deviceTypeId != null) 'deviceTypeId': deviceTypeId,
        if (requiredSkills != null) 'requiredSkills': requiredSkills,
        if (difficulty != null) 'difficulty': difficulty,
        if (locationArea != null) 'locationArea': locationArea!.trim(),
        if (deadline != null) 'deadline': deadline!.toUtc().toIso8601String(),
        if (seats != null) 'seats': seats,
        if (expectedHours != null) 'expectedHours': expectedHours,
        if (creating) 'supervisionAcknowledged': supervisionAcknowledged,
      };
}

/// Supervised learning tasks for students: browse, apply, track, and what they earned.
class LearningRepository {
  LearningRepository(this._api);

  final ApiClient _api;
  Dio get _dio => _api.dio;

  PageResult<T> _page<T>(Response<dynamic> res, T Function(Map<String, dynamic>) read, int page) {
    final body = (res.data as Map).cast<String, dynamic>();
    final items = [for (final raw in body['data'] as List) read((raw as Map).cast<String, dynamic>())];
    final meta = body['meta'] is Map ? (body['meta'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    return PageResult(
      items: items,
      page: (meta['page'] as num?)?.toInt() ?? page,
      pages: (meta['pages'] as num?)?.toInt() ?? 1,
      total: (meta['total'] as num?)?.toInt() ?? items.length,
    );
  }

  Map<String, dynamic> _data(Response<dynamic> res) => ((res.data as Map)['data'] as Map).cast<String, dynamic>();

  Future<PageResult<Opportunity>> opportunities(OpportunityQuery query) => guard(() async {
        final res = await _dio.get<dynamic>('/students/opportunities', queryParameters: query.toParams());
        return _page(res, Opportunity.fromJson, query.page);
      });

  Future<Opportunity> opportunity(String id) => guard(() async => Opportunity.fromJson(_data(await _dio.get<dynamic>('/students/opportunities/$id'))));

  /// Applies to a task. Only verified students may (BR-01); the server says why when they cannot.
  Future<Application> apply(String opportunityId, {String? message}) => guard(() async {
        final text = message?.trim() ?? '';
        final res = await _dio.post<dynamic>('/students/applications', data: {'opportunityId': opportunityId, if (text.isNotEmpty) 'message': text});
        return Application.fromJson(_data(res));
      });

  Future<PageResult<Application>> applications({String? status, int page = 1}) => guard(() async {
        final res = await _dio.get<dynamic>('/students/applications', queryParameters: {
          'page': page,
          'limit': 10,
          if (status != null && status.isNotEmpty) 'status': status,
        });
        return _page(res, Application.fromJson, page);
      });

  Future<Application> application(String id) => guard(() async => Application.fromJson(_data(await _dio.get<dynamic>('/students/applications/$id'))));

  Future<Application> withdraw(String id, {String? reason}) => guard(() async {
        final text = reason?.trim() ?? '';
        return Application.fromJson(_data(await _dio.post<dynamic>('/students/applications/$id/withdraw', data: {if (text.isNotEmpty) 'reason': text})));
      });

  Future<Experience> experience() => guard(() async => Experience.fromJson(_data(await _dio.get<dynamic>('/students/experience'))));

  Future<List<Certificate>> certificates() => guard(() async {
        final res = await _dio.get<dynamic>('/students/certificates');
        return [for (final raw in (res.data as Map)['data'] as List) Certificate.fromJson((raw as Map).cast<String, dynamic>())];
      });

  /// A certificate as a PDF: the file's bytes and the name the server gave it.
  Future<({Uint8List bytes, String filename})> certificatePdf(String id) => guard(() async {
        final res = await _dio.get<List<int>>('/students/certificates/$id/pdf', options: Options(responseType: ResponseType.bytes));
        final name = RegExp(r'filename="?([^";]+)"?', caseSensitive: false).firstMatch(res.headers.value('content-disposition') ?? '')?.group(1);
        return (bytes: Uint8List.fromList(res.data ?? const <int>[]), filename: name ?? 'certificate.pdf');
      });

  /* ---------- the supervising technician ---------- */

  /// The tasks the signed-in technician posted, optionally only `open`, `closed` or `filled`.
  Future<PageResult<Opportunity>> myOpportunities({String? status, int page = 1}) => guard(() async {
        final res = await _dio.get<dynamic>('/students/opportunities/mine', queryParameters: {'page': page, 'limit': 10, if (status != null && status.isNotEmpty) 'status': status});
        return _page(res, Opportunity.fromJson, page);
      });

  Future<Opportunity> createOpportunity(OpportunityInput input) =>
      guard(() async => Opportunity.fromJson(_data(await _dio.post<dynamic>('/students/opportunities', data: input.toJson(creating: true)))));

  Future<Opportunity> updateOpportunity(String id, OpportunityInput input) =>
      guard(() async => Opportunity.fromJson(_data(await _dio.put<dynamic>('/students/opportunities/$id', data: input.toJson(creating: false)))));

  /// Closes a task to new applications, or opens it again.
  Future<Opportunity> setOpportunityOpen(String id, {required bool open}) =>
      guard(() async => Opportunity.fromJson(_data(await _dio.put<dynamic>('/students/opportunities/$id/status', data: {'status': open ? 'open' : 'closed'}))));

  /// The applications on one of the supervisor's tasks.
  Future<PageResult<Application>> applicants(String opportunityId, {String? status, int page = 1}) => guard(() async {
        final res = await _dio.get<dynamic>('/students/opportunities/$opportunityId/applications', queryParameters: {'page': page, 'limit': 20, if (status != null && status.isNotEmpty) 'status': status});
        return _page(res, Application.fromJson, page);
      });

  /// Accepts or rejects an application, with an optional note for the student.
  Future<Application> decide(String id, {required bool accept, String? feedback}) => guard(() async {
        final text = feedback?.trim() ?? '';
        return Application.fromJson(_data(await _dio.put<dynamic>('/students/applications/$id/decision', data: {'decision': accept ? 'accepted' : 'rejected', if (text.isNotEmpty) 'feedback': text})));
      });

  Future<Application> start(String id) => guard(() async => Application.fromJson(_data(await _dio.post<dynamic>('/students/applications/$id/start'))));

  /// Finishes the task, recording the hours the student worked (at least half an hour).
  Future<Application> complete(String id, {required double hours, String? feedback}) => guard(() async {
        final text = feedback?.trim() ?? '';
        return Application.fromJson(_data(await _dio.put<dynamic>('/students/applications/$id/complete', data: {'hours': hours, if (text.isNotEmpty) 'feedback': text})));
      });
}
