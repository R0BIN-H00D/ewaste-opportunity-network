import 'package:ewaste_opportunity/core/listing_validation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('device name needs 2 to 120 characters', () {
    expect(validateDeviceName(''), isNotNull);
    expect(validateDeviceName(' a '), isNotNull);
    expect(validateDeviceName('Old laptop'), isNull);
    expect(validateDeviceName('x' * 121), isNotNull);
  });

  test('year is optional but must be in range when given', () {
    expect(validatePurchaseYear('', thisYear: 2026), isNull);
    expect(validatePurchaseYear('2019', thisYear: 2026), isNull);
    expect(validatePurchaseYear('2027', thisYear: 2026), isNull);
    expect(validatePurchaseYear('2028', thisYear: 2026), isNotNull);
    expect(validatePurchaseYear('1989', thisYear: 2026), isNotNull);
    expect(validatePurchaseYear('abc', thisYear: 2026), isNotNull);
  });

  test('price is optional, zero is allowed, negative is not', () {
    expect(validateExpectedPrice(''), isNull);
    expect(validateExpectedPrice('0'), isNull);
    expect(validateExpectedPrice('1,500.50'), isNull);
    expect(validateExpectedPrice('-5'), isNotNull);
    expect(validateExpectedPrice('free'), isNotNull);
  });

  test('length limits', () {
    expect(validateBrandOrModel('x' * 60), isNull);
    expect(validateBrandOrModel('x' * 61), isNotNull);
    expect(validateDescription('x' * 2001), isNotNull);
    expect(validateAreaOrCity('x' * 101), isNotNull);
  });

  group('photoProblem', () {
    test('accepts JPEG, PNG and WebP up to 5 MB', () {
      expect(photoProblem(mime: 'image/jpeg', bytes: 1000), isNull);
      expect(photoProblem(mime: 'image/png', bytes: maxPhotoBytes), isNull);
      expect(photoProblem(mime: 'image/webp', bytes: 1), isNull);
    });

    test('refuses other types and big files', () {
      expect(photoProblem(mime: 'image/gif', bytes: 10), isNotNull);
      expect(photoProblem(mime: '', bytes: 10), isNotNull);
      expect(photoProblem(mime: 'image/jpeg', bytes: maxPhotoBytes + 1), isNotNull);
    });
  });

  test('mimeFromName goes by the ending', () {
    expect(mimeFromName('IMG_1.JPG'), 'image/jpeg');
    expect(mimeFromName('a.jpeg'), 'image/jpeg');
    expect(mimeFromName('a.png'), 'image/png');
    expect(mimeFromName('a.webp'), 'image/webp');
    expect(mimeFromName('a.heic'), '');
  });
}
