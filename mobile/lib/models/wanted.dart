/// A device a refurbisher is looking for. Owners and technicians can accept it; the refurbisher sees who did.
class WantedRequest {
  const WantedRequest({
    required this.id,
    required this.title,
    this.categoryName,
    this.brand,
    this.minCondition,
    this.quantity = 1,
    this.city,
    this.notes,
    this.status = 'open',
    this.refurbisherName,
    this.hasResponded = false,
    this.responseCount = 0,
  });

  final String id;
  final String title;
  final String? categoryName;
  final String? brand;
  final String? minCondition;
  final int quantity;
  final String? city;
  final String? notes;
  final String status;
  final String? refurbisherName;

  /// On the board: whether the signed-in person already accepted it.
  final bool hasResponded;

  /// On a refurbisher's own list: how many people accepted it.
  final int responseCount;

  bool get isOpen => status == 'open';

  factory WantedRequest.fromJson(Map<String, dynamic> json) {
    final category = (json['category'] as Map?)?.cast<String, dynamic>() ?? const {};
    final who = (json['refurbisher'] as Map?)?.cast<String, dynamic>() ?? const {};
    return WantedRequest(
      id: json['_id'] as String,
      title: json['title'] as String? ?? '',
      categoryName: category['name'] as String?,
      brand: json['brand'] as String?,
      minCondition: json['minCondition'] as String?,
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      city: json['city'] as String?,
      notes: json['notes'] as String?,
      status: json['status'] as String? ?? 'open',
      refurbisherName: who['name'] as String?,
      hasResponded: (json['hasResponded'] as bool?) ?? false,
      responseCount: (json['responseCount'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Someone who accepted a wanted request.
class WantedResponse {
  const WantedResponse({required this.id, required this.name, required this.role, this.message});

  final String id;
  final String name;
  final String role;
  final String? message;

  factory WantedResponse.fromJson(Map<String, dynamic> json) {
    final who = (json['responder'] as Map?)?.cast<String, dynamic>() ?? const {};
    return WantedResponse(
      id: json['_id'] as String,
      name: who['name'] as String? ?? 'Someone',
      role: who['role'] as String? ?? 'user',
      message: json['message'] as String?,
    );
  }
}
