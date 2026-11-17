import 'package:ewaste_opportunity/models/listing_input.dart';
import 'package:ewaste_opportunity/services/device_repository.dart';
import 'package:ewaste_opportunity/services/location_service.dart';
import 'package:flutter_test/flutter_test.dart';

ListingInput _input({double? lat, double? lng}) =>
    ListingInput(name: 'Dell laptop', category: 'laptops', condition: 'fully_working', preferredService: 'repair', lat: lat, lng: lng);

void main() {
  group('GeoPoint', () {
    test('rounds to five places, about a metre', () {
      final p = const GeoPoint(12.971598765, 77.594566123).rounded();
      expect(p.lat, 12.9716);
      expect(p.lng, 77.59457);
    });

    test('has a readable label and compares by value', () {
      expect(const GeoPoint(12.9716, 77.5946).label, '12.97160, 77.59460');
      expect(const GeoPoint(1, 2), const GeoPoint(1, 2));
      expect(const GeoPoint(1, 2) == const GeoPoint(1, 3), isFalse);
    });
  });

  group('ListingInput', () {
    test('leaves the position out when none was shared', () {
      final fields = _input().toFields();
      expect(fields.containsKey('lat'), isFalse);
      expect(fields.containsKey('lng'), isFalse);
    });

    test('sends both coordinates when shared', () {
      final fields = _input(lat: 12.9716, lng: 77.5946).toFields();
      expect(fields['lat'], '12.97160');
      expect(fields['lng'], '77.59460');
    });

    test('never sends one coordinate alone, which the server refuses', () {
      final fields = _input(lat: 12.9716).toFields();
      expect(fields.containsKey('lat'), isFalse);
      expect(fields.containsKey('lng'), isFalse);
    });
  });

  group('ListingQuery near me', () {
    test('adds lat, lng and the distance only when all three are set', () {
      expect(const ListingQuery().toParams().containsKey('radiusKm'), isFalse);
      expect(const ListingQuery(lat: 12.9, lng: 77.5).toParams().containsKey('lat'), isFalse);
      final params = const ListingQuery(lat: 12.9716, lng: 77.5946, radiusKm: 10).toParams();
      expect(params['lat'], '12.97160');
      expect(params['lng'], '77.59460');
      expect(params['radiusKm'], 10);
    });

    test('counts as one active filter', () {
      expect(const ListingQuery().activeFilters, 0);
      expect(const ListingQuery(lat: 1, lng: 2, radiusKm: 5).activeFilters, 1);
      expect(const ListingQuery(city: 'Pune', lat: 1, lng: 2, radiusKm: 5).activeFilters, 2);
    });

    test('copyWith keeps the point, and clearNearby removes it', () {
      final near = const ListingQuery(lat: 1, lng: 2, radiusKm: 5).copyWith(sort: 'oldest');
      expect(near.hasNearby, isTrue);
      expect(near.copyWith(clearNearby: true).hasNearby, isFalse);
    });
  });
}
