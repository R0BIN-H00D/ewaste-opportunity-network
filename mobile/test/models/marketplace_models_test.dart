import 'package:ewaste_opportunity/core/format.dart';
import 'package:ewaste_opportunity/core/order_validation.dart';
import 'package:ewaste_opportunity/models/marketplace.dart';
import 'package:flutter_test/flutter_test.dart';

/// A product as `GET /api/marketplace` (and, with [detail], `/:id`) sends it.
Map<String, dynamic> productJson(
        {String id = 'p1',
        String title = 'Refurbished ThinkPad',
        bool detail = false,
        int stock = 3,
        String status = 'active',
        bool isMine = false,
        String condition = 'good'}) =>
    {
      '_id': id,
      'title': title,
      'brand': 'Lenovo',
      'model': 'T480',
      'condition': condition,
      'price': 24999,
      'stock': stock,
      'photos': [
        {'url': '/uploads/products/p.jpg', 'publicId': 'p'},
      ],
      'category': {'_id': 'c2', 'name': 'Laptops', 'slug': 'laptops'},
      'status': status,
      'isRefurbished': true,
      'label': 'Refurbished',
      'seller': {
        '_id': 's1',
        'name': 'Meera',
        'businessName': 'ReNew Devices',
        'city': 'Pune',
        'ratingAvg': 4.6,
        'ratingCount': 8
      },
      'createdAt': '2026-11-10T09:00:00.000Z',
      if (isMine) 'isMine': true,
      if (detail) ...{
        'specs': {'RAM': '8 GB', 'Storage': '256 GB SSD'},
        'refurbishmentInfo': 'Replaced the battery and tested every port.',
      },
    };

/// An order as `GET /api/orders` (short form) or `/:id` (with [detail]) sends it.
Map<String, dynamic> orderJson({
  String id = 'o1',
  String status = 'placed',
  String role = 'buyer',
  List<String> actions = const [],
  bool detail = true,
  bool canReview = false,
  bool reviewed = false,
  String? cancelReason,
  String paymentStatus = 'pending',
  int quantity = 2,
}) =>
    {
      '_id': id,
      'status': status,
      'product': {
        '_id': 'p1',
        'title': 'Refurbished ThinkPad',
        'condition': 'good',
        'photo': {'url': '/uploads/products/p.jpg'},
        'isRefurbished': true,
        'label': 'Refurbished',
      },
      'quantity': quantity,
      'priceAtOrder': 24999,
      'total': 24999 * quantity,
      'paymentMethod': 'cod',
      'paymentStatus': paymentStatus,
      'buyer': {'_id': 'u1', 'name': 'Asha'},
      'seller': {
        '_id': 's1',
        'name': 'Meera',
        'businessName': 'ReNew Devices',
        'city': 'Pune'
      },
      'viewerRole': role,
      'createdAt': '2026-11-10T09:00:00.000Z',
      'updatedAt': '2026-11-12T09:00:00.000Z',
      if (detail) ...{
        'deliveryArea': 'Indiranagar',
        'notes': 'Call first',
        if (cancelReason != null) 'cancelReason': cancelReason,
        'reviewed': reviewed,
        'history': [
          {'status': 'placed', 'at': '2026-11-10T09:00:00.000Z', 'note': null},
        ],
        'actions': actions,
        'canReview': canReview,
      },
    };

void main() {
  group('Product', () {
    test('reads the shop form: label data, price, stock and the seller', () {
      final p = Product.fromJson(productJson());
      expect(p.title, 'Refurbished ThinkPad');
      expect(p.subtitle, 'Lenovo · T480');
      expect(p.price, 24999);
      expect(p.stock, 3);
      expect(p.categoryName, 'Laptops');
      expect(p.photos.single.url, '/uploads/products/p.jpg');
      expect(p.sellerName,
          'ReNew Devices'); // the business name wins over the person's name
      expect(p.sellerCity, 'Pune');
      expect(p.hasSellerRating, isTrue);
      expect(p.canOrder, isTrue);
      expect(p.specs, isEmpty);
    });

    test('reads the detail form: what was done and the specifications', () {
      final p = Product.fromJson(productJson(detail: true));
      expect(p.refurbishmentInfo, contains('Replaced the battery'));
      expect(p.specs, {'RAM': '8 GB', 'Storage': '256 GB SSD'});
    });

    test('cannot be ordered when sold out, hidden or your own', () {
      expect(Product.fromJson(productJson(stock: 0)).canOrder, isFalse);
      expect(Product.fromJson(productJson(status: 'hidden')).canOrder, isFalse);
      expect(Product.fromJson(productJson(isMine: true)).canOrder, isFalse);
    });

    test(
        'falls back to the seller\'s name, and to safe values for missing fields',
        () {
      final p = Product.fromJson(const {
        '_id': 'x',
        'seller': {'_id': 's', 'name': 'Meera'}
      });
      expect(p.sellerName, 'Meera');
      expect(p.title, 'Product');
      expect(p.hasSellerRating, isFalse);
      expect(p.photos, isEmpty);
    });
  });

  group('Order', () {
    test('the list form has no actions or history', () {
      final o = Order.fromJson(orderJson(detail: false));
      expect(o.productTitle, 'Refurbished ThinkPad');
      expect(o.quantity, 2);
      expect(o.total, 49998);
      expect(o.sellerName, 'ReNew Devices');
      expect(o.buyerName, 'Asha');
      expect(o.photo?.url, '/uploads/products/p.jpg');
      expect(o.actions, isEmpty);
      expect(o.history, isEmpty);
      expect(o.isSellerView, isFalse);
    });

    test('the detail form reads actions, history, payment and review state',
        () {
      final o = Order.fromJson(orderJson(
          status: 'completed',
          role: 'seller',
          actions: ['cancel'],
          canReview: true,
          paymentStatus: 'paid_offline'));
      expect(o.isSellerView, isTrue);
      expect(o.can('cancel'), isTrue);
      expect(o.can('confirm'), isFalse);
      expect(o.canReview, isTrue);
      expect(o.paymentStatus, 'paid_offline');
      expect(o.deliveryArea, 'Indiranagar');
      expect(o.history.single.status, 'placed');
      expect(o.isFinished, isTrue);
    });

    test('an order that is still moving is not finished', () {
      expect(
          Order.fromJson(orderJson(status: 'delivered')).isFinished, isFalse);
      expect(Order.fromJson(orderJson(status: 'cancelled')).isFinished, isTrue);
    });
  });

  group('labels and validation', () {
    test('the label and the disclosed grade always go together', () {
      expect(refurbishedLabel('like_new'), 'Refurbished · Like new');
      expect(refurbishedLabel('fair'), 'Refurbished · Fair');
    });

    test('order statuses have buyer and seller wording', () {
      expect(orderStatusLabel('placed'), 'Waiting for the seller');
      expect(orderStatusLabel('placed', seller: true), 'New order');
      expect(orderStatusLabel('delivered', seller: true),
          'Waiting for the buyer to confirm');
      expect(orderStatusLabel('confirmed', seller: true), 'Confirmed');
      expect(orderStatusLabel('new_thing'), 'new_thing');
    });

    test('payment is never through the app', () {
      expect(labelOf(paymentMethods, 'cod'), 'Cash on delivery');
      expect(paymentMethods.map((p) => p.$1), ['cod', 'offline']);
    });

    test('an enquiry needs a short question', () {
      expect(validateEnquiry(''), isNotNull);
      expect(validateEnquiry('Hi'), isNotNull);
      expect(validateEnquiry('Is the battery new?'), isNull);
      expect(validateEnquiry('x' * 1001), isNotNull);
    });

    test(
        'delivery area, city and pincode are required and checked; notes are optional but limited',
        () {
      expect(validateDeliveryArea(null), isNotNull);
      expect(validateDeliveryArea('12'), isNotNull);
      expect(validateDeliveryArea('Indiranagar'), isNull);
      expect(validateDeliveryArea('x' * 151), isNotNull);
      expect(validateDeliveryCity('560038'), isNotNull);
      expect(validateDeliveryCity('Bengaluru'), isNull);
      expect(validateDeliveryPincode('56003'), isNotNull);
      expect(validateDeliveryPincode('056038'), isNotNull);
      expect(validateDeliveryPincode('560038'), isNull);
      expect(validateOrderNotes('x' * 501), isNotNull);
    });
  });
}
