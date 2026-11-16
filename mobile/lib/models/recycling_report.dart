DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v) : null;
Map<String, dynamic> _map(Object? v) => v is Map ? v.cast<String, dynamic>() : const <String, dynamic>{};
double? _kg(Object? v) => v is num ? v.toDouble() : null;

/// One material in the report. Measured (actual) and estimated weights stay in separate columns (BR-06).
class ReportMaterial {
  const ReportMaterial({required this.type, this.actualKg = 0, this.estimatedKg = 0});

  final String type;
  final double actualKg;
  final double estimatedKg;

  bool get isEmpty => actualKg == 0 && estimatedKg == 0;

  factory ReportMaterial.fromJson(Map<String, dynamic> json) =>
      ReportMaterial(type: (json['type'] as String?) ?? 'other', actualKg: _kg(json['actualKg']) ?? 0, estimatedKg: _kg(json['estimatedKg']) ?? 0);
}

class ReportCategory {
  const ReportCategory({required this.name, this.requests = 0, this.devices = 0});

  final String name;
  final int requests;
  final int devices;

  factory ReportCategory.fromJson(Map<String, dynamic> json) => ReportCategory(
        name: (_map(json['category'])['name'] as String?) ?? 'Other',
        requests: (json['requests'] as num?)?.toInt() ?? 0,
        devices: (json['devices'] as num?)?.toInt() ?? 0,
      );
}

/// One completed request in the report.
class ReportItem {
  const ReportItem({required this.id, required this.refNo, this.completedAt, this.deviceCount = 0, this.categories = const [], this.materials = const []});

  final String id;
  final String refNo;
  final DateTime? completedAt;
  final int deviceCount;
  final List<String> categories;
  final List<ReportMaterial> materials;

  factory ReportItem.fromJson(Map<String, dynamic> json) {
    final cats = json['categories'];
    final mats = json['materials'];
    return ReportItem(
      id: (json['_id'] as String?) ?? '',
      refNo: (json['refNo'] as String?) ?? '',
      completedAt: _date(json['completedAt']),
      deviceCount: (json['deviceCount'] as num?)?.toInt() ?? 0,
      categories: cats is List ? [for (final c in cats) if (c is String) c] : const [],
      materials: mats is List ? [for (final m in mats) if (m is Map) ReportMaterial.fromJson(m.cast<String, dynamic>())] : const [],
    );
  }
}

/// A recycling centre's activity report for a period: requests by status, what was completed, and the materials recovered (FR-REC-006).
class RecyclingReport {
  const RecyclingReport({
    required this.center,
    this.from,
    this.to,
    this.totalRequests = 0,
    this.byStatus = const {},
    this.completedCount = 0,
    this.completedDevices = 0,
    this.materials = const [],
    this.totalActualKg = 0,
    this.totalEstimatedKg = 0,
    this.byCategory = const [],
    this.items = const [],
  });

  final String center;
  final DateTime? from;
  final DateTime? to;
  final int totalRequests;
  final Map<String, int> byStatus;
  final int completedCount;
  final int completedDevices;
  final List<ReportMaterial> materials;
  final double totalActualKg;
  final double totalEstimatedKg;
  final List<ReportCategory> byCategory;
  final List<ReportItem> items;

  /// Only the materials with a weight, so the table is not padded with zeros.
  List<ReportMaterial> get recovered => [for (final m in materials) if (!m.isEmpty) m];

  factory RecyclingReport.fromJson(Map<String, dynamic> json) {
    final range = _map(json['range']);
    final requests = _map(json['requests']);
    final completed = _map(json['completed']);
    final totals = _map(json['totals']);
    final mats = json['materials'];
    final cats = json['byCategory'];
    final items = json['items'];
    return RecyclingReport(
      center: (json['center'] as String?) ?? 'Recycling centre',
      from: _date(range['from']),
      to: _date(range['to']),
      totalRequests: (requests['total'] as num?)?.toInt() ?? 0,
      byStatus: {for (final e in _map(requests['byStatus']).entries) if (e.value is num) e.key: (e.value as num).toInt()},
      completedCount: (completed['count'] as num?)?.toInt() ?? 0,
      completedDevices: (completed['devices'] as num?)?.toInt() ?? 0,
      materials: mats is List ? [for (final m in mats) if (m is Map) ReportMaterial.fromJson(m.cast<String, dynamic>())] : const [],
      totalActualKg: _kg(totals['actualKg']) ?? 0,
      totalEstimatedKg: _kg(totals['estimatedKg']) ?? 0,
      byCategory: cats is List ? [for (final c in cats) if (c is Map) ReportCategory.fromJson(c.cast<String, dynamic>())] : const [],
      items: items is List ? [for (final i in items) if (i is Map) ReportItem.fromJson(i.cast<String, dynamic>())] : const [],
    );
  }
}
