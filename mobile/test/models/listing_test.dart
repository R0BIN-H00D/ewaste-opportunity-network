import 'package:ewaste_opportunity/models/listing.dart';
import 'package:ewaste_opportunity/models/listing_input.dart';
import 'package:ewaste_opportunity/services/device_repository.dart';
import 'package:flutter_test/flutter_test.dart';

/// A listing as `GET /api/devices` sends it.
Map<String, dynamic> listingJson({String id = 'l1', String status = 'listed', bool isOwner = false, Object? price = 1500}) => {
      '_id': id,
      'title': 'Old Samsung phone',
      'condition': 'minor_damage',
      'description': 'Cracked screen',
      'preferredService': 'repair',
      'expectedPrice': price,
      'pickupPreference': 'either',
      'addressArea': 'Indiranagar',
      'city': 'Bengaluru',
      'status': status,
      'isOwner': isOwner,
      'viewCount': 7,
      'category': {'name': 'Phones', 'slug': 'phones'},
      'owner': {'name': 'Asha'},
      'device': {
        'name': 'Galaxy A12',
        'brand': 'Samsung',
        'model': 'A12',
        'purchaseYear': 2021,
        'ageYears': 5,
        'photos': [
          {'url': '/uploads/devices/a.jpg', 'publicId': 'a'},
          {'url': '/uploads/devices/b.jpg'},
        ],
      },
    };

void main() {
  group('Listing.createdAt', () {
    test('is read from the server so lists can say when it was listed', () {
      final l = Listing.fromJson({...listingJson(), 'createdAt': '2026-11-18T14:31:00.000Z'});
      expect(l.createdAt, DateTime.utc(2026, 11, 18, 14, 31));
      expect(Listing.fromJson(listingJson()).createdAt, isNull);
    });
  });

  group('Listing.fromJson', () {
    test('reads the listing, its device, category and owner', () {
      final l = Listing.fromJson(listingJson(isOwner: true));
      expect(l.id, 'l1');
      expect(l.title, 'Old Samsung phone');
      expect(l.brand, 'Samsung');
      expect(l.condition, 'minor_damage');
      expect(l.expectedPrice, 1500);
      expect(l.categoryName, 'Phones');
      expect(l.ownerName, 'Asha');
      expect(l.isOwner, isTrue);
      expect(l.viewCount, 7);
      expect(l.photos, hasLength(2));
      expect(l.photos.first.url, '/uploads/devices/a.jpg');
      expect(l.purchaseYear, 2021);
      expect(l.isLive, isTrue);
    });

    test('place and subtitle skip what is missing', () {
      final l = Listing.fromJson(listingJson());
      expect(l.place, 'Indiranagar, Bengaluru');
      expect(l.subtitle, 'Phones · Samsung · A12');

      final bare = Listing.fromJson({'_id': 'x', 'title': 'T', 'condition': 'fully_working', 'preferredService': 'reuse'});
      expect(bare.place, '');
      expect(bare.subtitle, '');
      expect(bare.photos, isEmpty);
      expect(bare.expectedPrice, isNull);
      expect(bare.isOwner, isFalse);
    });

    test('an integer price is read as a number, and a missing one as null', () {
      expect(Listing.fromJson(listingJson(price: 0)).expectedPrice, 0);
      expect(Listing.fromJson(listingJson(price: null)).expectedPrice, isNull);
    });

    test('a moderation reason is kept for the owner', () {
      final json = listingJson(status: 'removed_by_admin', isOwner: true)..['moderation'] = {'reason': 'Duplicate'};
      final l = Listing.fromJson(json);
      expect(l.moderationReason, 'Duplicate');
      expect(l.isLive, isFalse);
    });
  });

  group('ListingQuery', () {
    test('leaves out empty filters', () {
      expect(const ListingQuery().toParams(), {'page': 1, 'limit': 12, 'sort': 'newest'});
    });

    test('includes what is set, trimmed', () {
      final params = const ListingQuery(q: ' phone ', category: 'phones', condition: 'fully_working', service: 'repair', city: ' Pune ').toParams();
      expect(params['q'], 'phone');
      expect(params['category'], 'phones');
      expect(params['condition'], 'fully_working');
      expect(params['service'], 'repair');
      expect(params['city'], 'Pune');
    });

    test('status is only sent for the person\'s own listings', () {
      expect(const ListingQuery(status: 'listed').toParams().containsKey('status'), isFalse);
      final mine = const ListingQuery(mine: true, status: 'listed').toParams();
      expect(mine['mine'], 'true');
      expect(mine['status'], 'listed');
    });

    test('counts filters but not search or sort', () {
      expect(const ListingQuery(q: 'x', sort: 'price_asc', service: 'repair').activeFilters, 0);
      expect(const ListingQuery(category: 'phones', condition: 'fully_working', city: 'Pune').activeFilters, 3);
    });

    test('copyWith keeps the rest', () {
      final q = const ListingQuery(mine: true, category: 'phones').copyWith(page: 3);
      expect(q.page, 3);
      expect(q.mine, isTrue);
      expect(q.category, 'phones');
    });
  });

  group('ListingInput.toFields', () {
    test('sends the required fields and leaves out empty ones', () {
      const input = ListingInput(name: ' Laptop ', category: 'laptops', condition: 'not_working', preferredService: 'recycling');
      expect(input.toFields(), {
        'name': 'Laptop',
        'category': 'laptops',
        'condition': 'not_working',
        'preferredService': 'recycling',
        'status': 'listed',
      });
    });

    test('includes optional values, removes commas from the price and marks drafts', () {
      const input = ListingInput(
        name: 'Phone',
        category: 'phones',
        condition: 'fully_working',
        preferredService: 'donation',
        brand: 'Nokia',
        purchaseYear: '2018',
        expectedPrice: '1,200',
        pickupPreference: 'pickup',
        city: 'Pune',
        draft: true,
      );
      final f = input.toFields();
      expect(f['brand'], 'Nokia');
      expect(f['purchaseYear'], '2018');
      expect(f['expectedPrice'], '1200');
      expect(f['pickupPreference'], 'pickup');
      expect(f['city'], 'Pune');
      expect(f['status'], 'draft');
      expect(f.containsKey('model'), isFalse);
    });
  });
}
