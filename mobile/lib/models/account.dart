/// The signed-in person's own profile (`GET /api/users/me/profile`): where they are, a short bio and their preferences.
class OwnProfile {
  const OwnProfile({
    this.bio = '',
    this.addressArea = '',
    this.city = '',
    this.state = '',
    this.pincode = '',
    this.emailNotifications = true,
    this.pushNotifications = true,
    this.theme = 'system',
  });

  final String bio;
  final String addressArea;
  final String city;
  final String state;
  final String pincode;
  final bool emailNotifications;
  final bool pushNotifications;

  /// `light`, `dark` or `system`.
  final String theme;

  factory OwnProfile.fromJson(Map<String, dynamic> json) {
    final prefs = json['preferences'] is Map ? (json['preferences'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    String s(String key) => (json[key] as String?) ?? '';
    final theme = prefs['theme'];
    return OwnProfile(
      bio: s('bio'),
      addressArea: s('addressArea'),
      city: s('city'),
      state: s('state'),
      pincode: s('pincode'),
      emailNotifications: prefs['emailNotifications'] != false,
      pushNotifications: prefs['pushNotifications'] != false,
      theme: theme == 'light' || theme == 'dark' ? theme as String : 'system',
    );
  }
}

/// One entry in the notification centre.
class NotificationItem {
  const NotificationItem({required this.id, required this.type, required this.title, this.body, this.requestId, this.readAt, this.createdAt});

  final String id;
  final String type;
  final String title;
  final String? body;

  /// The repair request it is about, when there is one (opens it on tap).
  final String? requestId;
  final DateTime? readAt;
  final DateTime? createdAt;

  bool get isRead => readAt != null;

  NotificationItem markedRead() => NotificationItem(id: id, type: type, title: title, body: body, requestId: requestId, readAt: readAt ?? DateTime.now(), createdAt: createdAt);

  factory NotificationItem.fromJson(Map<String, dynamic> json) {
    final data = json['data'] is Map ? (json['data'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    final link = data['deepLink'] as String?;
    final id = data['id'];
    // Only repair requests have a screen in the app so far; other links stay on the web.
    final isRequest = link == null ? false : link.contains('/requests/');
    return NotificationItem(
      id: json['_id'] as String,
      type: (json['type'] as String?) ?? '',
      title: (json['title'] as String?) ?? '',
      body: json['body'] as String?,
      requestId: isRequest && id != null ? id.toString() : null,
      readAt: json['readAt'] is String ? DateTime.tryParse(json['readAt'] as String) : null,
      createdAt: json['createdAt'] is String ? DateTime.tryParse(json['createdAt'] as String) : null,
    );
  }
}

/// A payment record. The platform never handles money; these record what was paid directly (BR-10).
class PaymentRecord {
  const PaymentRecord({
    required this.id,
    required this.type,
    required this.amount,
    required this.status,
    required this.received,
    this.method = 'offline',
    this.title = '',
    this.counterparty,
    this.requestId,
    this.createdAt,
  });

  final String id;
  final String type;
  final double amount;
  final String method;

  /// `recorded`, `confirmed` or `disputed`.
  final String status;

  /// True when the person was paid; false when they paid.
  final bool received;
  final String title;
  final String? counterparty;
  final String? requestId;
  final DateTime? createdAt;

  factory PaymentRecord.fromJson(Map<String, dynamic> json) {
    final subject = json['subject'] is Map ? (json['subject'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    final other = json['counterparty'] is Map ? (json['counterparty'] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    return PaymentRecord(
      id: json['_id'] as String,
      type: (json['type'] as String?) ?? '',
      amount: (json['amount'] as num?)?.toDouble() ?? 0,
      method: (json['method'] as String?) ?? 'offline',
      status: (json['status'] as String?) ?? 'recorded',
      received: json['direction'] == 'received',
      title: (subject['title'] as String?) ?? '',
      counterparty: other['name'] as String?,
      requestId: subject['kind'] == 'repair' ? subject['id'] as String? : null,
      createdAt: json['createdAt'] is String ? DateTime.tryParse(json['createdAt'] as String) : null,
    );
  }
}

/// Totals for the transaction history header.
class PaymentSummary {
  const PaymentSummary({this.paid = 0, this.paidCount = 0, this.received = 0, this.receivedCount = 0});

  final double paid;
  final int paidCount;
  final double received;
  final int receivedCount;

  factory PaymentSummary.fromJson(Map<String, dynamic> json) {
    Map<String, dynamic> part(String key) => json[key] is Map ? (json[key] as Map).cast<String, dynamic>() : const <String, dynamic>{};
    final paid = part('paid');
    final received = part('received');
    return PaymentSummary(
      paid: (paid['total'] as num?)?.toDouble() ?? 0,
      paidCount: (paid['count'] as num?)?.toInt() ?? 0,
      received: (received['total'] as num?)?.toDouble() ?? 0,
      receivedCount: (received['count'] as num?)?.toInt() ?? 0,
    );
  }
}
