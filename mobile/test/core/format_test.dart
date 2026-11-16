import 'package:ewaste_opportunity/core/format.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('formatPrice', () {
    test('groups digits the Indian way', () {
      expect(formatPrice(999), '₹999');
      expect(formatPrice(1500), '₹1,500');
      expect(formatPrice(123456), '₹1,23,456');
      expect(formatPrice(12345678), '₹1,23,45,678');
    });

    test('rounds to whole rupees', () {
      expect(formatPrice(1499.6), '₹1,500');
    });

    test('zero is free and no price is on request', () {
      expect(formatPrice(0), 'Free');
      expect(formatPrice(null), 'Price on request');
    });
  });

  group('labelOf', () {
    test('finds the label', () {
      expect(labelOf(conditions, 'minor_damage'), 'Minor damage');
      expect(labelOf(services, 'repair'), 'Repair');
    });

    test('an unknown value is shown as it is, and null as nothing', () {
      expect(labelOf(services, 'teleport'), 'teleport');
      expect(labelOf(services, null), '');
    });
  });

  group('assetUrl', () {
    const base = 'http://10.0.2.2:5000/api';

    test('a path is joined to the server address, without /api', () {
      expect(assetUrl('/uploads/devices/a.jpg', apiBaseUrl: base), 'http://10.0.2.2:5000/uploads/devices/a.jpg');
    });

    test('a localhost address is pointed at the API host', () {
      expect(assetUrl('http://localhost:5000/uploads/a.jpg', apiBaseUrl: base), 'http://10.0.2.2:5000/uploads/a.jpg');
      expect(assetUrl('http://127.0.0.1:5000/uploads/a.jpg', apiBaseUrl: base), 'http://10.0.2.2:5000/uploads/a.jpg');
    });

    test('other addresses are left alone', () {
      expect(assetUrl('https://res.cloudinary.com/x/a.jpg', apiBaseUrl: base), 'https://res.cloudinary.com/x/a.jpg');
    });

    test('nothing gives nothing', () {
      expect(assetUrl(null, apiBaseUrl: base), '');
      expect(assetUrl('', apiBaseUrl: base), '');
    });
  });
}
