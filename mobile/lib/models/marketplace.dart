import 'listing.dart' show ListingPhoto;

DateTime? _date(Object? v) => v is String ? DateTime.tryParse(v) : null;
Map<String, dynamic> _map(Object? v) => v is Map ? v.cast<String, dynamic>() : const <String, dynamic>{};

List<ListingPhoto> _photos(Object? v) => v is List ? [for (final p in v) if (p is Map) ListingPhoto.fromJson(p.cast<String, dynamic>())] : const [];

/// A refurbished product on sale. Every product carries the "Refurbished" label and its disclosed condition (BR-11).
class Product {
  const Product({
    required this.id,
    required this.title,
    required this.condition,
    required this.price,
    this.stock = 0,
    this.brand,
    this.model,
    this.photos = const [],
    this.categoryName,
    this.categorySlug,
    this.status = 'active',
    this.sellerId = '',
    this.sellerName,
    this.sellerCity,
    this.sellerRatingAvg = 0,
    this.sellerRatingCount = 0,
    this.isMine = false,
    this.specs = const {},
    this.refurbishmentInfo,
    this.createdAt,
  });

  final String id;
  final String title;
  final String condition;
  final double price;
  final int stock;
  final String? brand;
  final String? model;
  final List<ListingPhoto> photos;
  final String? categoryName;
  final String? categorySlug;
  final String status;
  final String sellerId;

  /// The business name when there is one, otherwise the person's name.
  final String? sellerName;
  final String? sellerCity;
  final double sellerRatingAvg;
  final int sellerRatingCount;
  final bool isMine;

  /// Specification name to value, for example `RAM: 8 GB`. Only on the product page.
  final Map<String, String> specs;
  final String? refurbishmentInfo;
  final DateTime? createdAt;

  bool get canOrder => status == 'active' && stock > 0 && !isMine;
  bool get hasSellerRating => sellerRatingCount > 0;

  /// "Brand · Model", skipping what is missing.
  String get subtitle => [brand, model].where((p) => p != null && p.trim().isNotEmpty).join(' · ');

  factory Product.fromJson(Map<String, dynamic> json) {
    final seller = _map(json['seller']);
    final category = _map(json['category']);
    final specs = _map(json['specs']);
    final business = seller['businessName'];
    return Product(
      id: json['_id'] as String,
      title: (json['title'] as String?) ?? 'Product',
      condition: (json['condition'] as String?) ?? 'good',
      price: (json['price'] as num?)?.toDouble() ?? 0,
      stock: (json['stock'] as num?)?.toInt() ?? 0,
      brand: json['brand'] as String?,
      model: json['model'] as String?,
      photos: _photos(json['photos']),
      categoryName: category['name'] as String?,
      categorySlug: category['slug'] as String?,
      status: (json['status'] as String?) ?? 'active',
      sellerId: (seller['_id'] as String?) ?? '',
      sellerName: business is String && business.trim().isNotEmpty ? business : seller['name'] as String?,
      sellerCity: seller['city'] as String?,
      sellerRatingAvg: (seller['ratingAvg'] as num?)?.toDouble() ?? 0,
      sellerRatingCount: (seller['ratingCount'] as num?)?.toInt() ?? 0,
      isMine: json['isMine'] == true,
      specs: {for (final e in specs.entries) if (e.value is String) e.key: e.value as String},
      refurbishmentInfo: json['refurbishmentInfo'] as String?,
      createdAt: _date(json['createdAt']),
    );
  }
}

class OrderStep {
  const OrderStep({required this.status, this.at, this.note});

  final String status;
  final DateTime? at;
  final String? note;

  factory OrderStep.fromJson(Map<String, dynamic> json) => OrderStep(status: (json['status'] as String?) ?? '', at: _date(json['at']), note: json['note'] as String?);
}

/// An order for a refurbished product. Lists carry the short form; one order carries everything, including the
/// `actions` the signed-in person may take next. Payment is made to the seller directly (BR-10).
class Order {
  const Order({
    required this.id,
    required this.status,
    required this.viewerRole,
    this.productId = '',
    this.productTitle,
    this.productCondition,
    this.photo,
    this.quantity = 1,
    this.priceAtOrder = 0,
    this.total = 0,
    this.paymentMethod = 'cod',
    this.paymentStatus,
    this.buyerName,
    this.sellerName,
    this.createdAt,
    this.updatedAt,
    this.deliveryArea,
    this.notes,
    this.cancelReason,
    this.reviewed = false,
    this.history = const [],
    this.actions = const [],
    this.canReview = false,
  });

  final String id;
  final String status;

  /// `buyer`, `seller` or `admin`.
  final String viewerRole;
  final String productId;
  final String? productTitle;
  final String? productCondition;
  final ListingPhoto? photo;
  final int quantity;
  final double priceAtOrder;
  final double total;
  final String paymentMethod;
  final String? paymentStatus;
  final String? buyerName;
  final String? sellerName;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final String? deliveryArea;
  final String? notes;
  final String? cancelReason;
  final bool reviewed;
  final List<OrderStep> history;
  final List<String> actions;
  final bool canReview;

  bool get isSellerView => viewerRole == 'seller';
  bool get isFinished => status == 'completed' || status == 'cancelled';
  bool can(String action) => actions.contains(action);

  factory Order.fromJson(Map<String, dynamic> json) {
    final product = _map(json['product']);
    final buyer = _map(json['buyer']);
    final seller = _map(json['seller']);
    final business = seller['businessName'];
    final history = json['history'];
    final actions = json['actions'];
    return Order(
      id: json['_id'] as String,
      status: (json['status'] as String?) ?? 'placed',
      viewerRole: (json['viewerRole'] as String?) ?? 'buyer',
      productId: (product['_id'] as String?) ?? '',
      productTitle: product['title'] as String?,
      productCondition: product['condition'] as String?,
      photo: product['photo'] is Map ? ListingPhoto.fromJson(_map(product['photo'])) : null,
      quantity: (json['quantity'] as num?)?.toInt() ?? 1,
      priceAtOrder: (json['priceAtOrder'] as num?)?.toDouble() ?? 0,
      total: (json['total'] as num?)?.toDouble() ?? 0,
      paymentMethod: (json['paymentMethod'] as String?) ?? 'cod',
      paymentStatus: json['paymentStatus'] as String?,
      buyerName: buyer['name'] as String?,
      sellerName: business is String && business.trim().isNotEmpty ? business : seller['name'] as String?,
      createdAt: _date(json['createdAt']),
      updatedAt: _date(json['updatedAt']),
      deliveryArea: json['deliveryArea'] as String?,
      notes: json['notes'] as String?,
      cancelReason: json['cancelReason'] as String?,
      reviewed: json['reviewed'] == true,
      history: history is List ? [for (final h in history) if (h is Map) OrderStep.fromJson(h.cast<String, dynamic>())] : const [],
      actions: actions is List ? [for (final a in actions) if (a is String) a] : const [],
      canReview: json['canReview'] == true,
    );
  }
}
