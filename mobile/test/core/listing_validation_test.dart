import 'package:ewaste_opportunity/core/listing_validation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('device name needs 3 to 120 characters with a letter', () {
    expect(validateDeviceName(''), isNotNull);
    expect(validateDeviceName(' ab '), isNotNull);
    expect(validateDeviceName('12345'), isNotNull);
    expect(validateDeviceName('Old laptop'), isNull);
    expect(validateDeviceName('x' * 121), isNotNull);
  });

  test('the purchase year cannot be before the model year', () {
    expect(validateModelYear('', thisYear: 2026), isNotNull);
    expect(validateModelYear('2018', thisYear: 2026), isNull);
    expect(validateModelYear('2027', thisYear: 2026), isNotNull);
    expect(validatePurchaseYear('2017', thisYear: 2026, modelYear: '2018'), isNotNull);
    expect(validatePurchaseYear('2018', thisYear: 2026, modelYear: '2018'), isNull);
    expect(validatePurchaseYear('2020', thisYear: 2026, modelYear: '2018'), isNull);
    expect(validatePurchaseYear('2017', thisYear: 2026, modelYear: ''), isNull);
  });

  test('year is required and must be in range', () {
    expect(validatePurchaseYear('', thisYear: 2026), isNotNull);
    expect(validatePurchaseYear('2019', thisYear: 2026), isNull);
    expect(validatePurchaseYear('2026', thisYear: 2026), isNull);
    expect(validatePurchaseYear('2027', thisYear: 2026), isNotNull);
    expect(validatePurchaseYear('1989', thisYear: 2026), isNotNull);
    expect(validatePurchaseYear('abc', thisYear: 2026), isNotNull);
  });

  test('price is optional, zero is allowed, negative is not', () {
    expect(validateExpectedPrice(''), isNull);
    expect(validateExpectedPrice('0'), isNull);
    expect(validateExpectedPrice('1,500.50'), isNull);
    expect(validateExpectedPrice('-5'), isNotNull);
    expect(validateExpectedPrice('free'), isNotNull);
    expect(validateExpectedPrice('12.345'), isNotNull);
    expect(validateExpectedPrice('99999999'), isNotNull);
  });

  test('length limits', () {
    expect(validateBrandOrModel('x' * 60), isNull);
    expect(validateBrandOrModel('x' * 61), isNotNull);
    expect(validateDescription('x' * 2001), isNotNull);
    expect(validateArea('x' * 101), isNotNull);
  });

  test('the phone number is a 10-digit mobile number', () {
    expect(validateAgentPhone(''), isNotNull);
    expect(validateAgentPhone('12345'), isNotNull);
    expect(validateAgentPhone('5876543210'), isNotNull);
    expect(validateAgentPhone('98765 43210'), isNull);
    expect(validateAgentPhone('+91 98765-43210'), isNull);
    expect(validateAgentPhone('09876543210'), isNull);
    expect(normalizePhone('+91 98765-43210'), '9876543210');
  });

  test('brand, description, area and city are required and checked', () {
    expect(validateBrand(''), isNotNull);
    expect(validateBrand('H'), isNotNull);
    expect(validateBrand('HP'), isNull);
    expect(validateModel(''), isNotNull);
    expect(validateModel('###'), isNotNull);
    expect(validateModel('Galaxy A12'), isNull);
    expect(validateDescription(''), isNull);
    expect(validateDescription('ok'), isNull);
    expect(validateDescription('x' * 2001), isNotNull);
    expect(validateArea('12'), isNotNull);
    expect(validateArea('### road'), isNotNull);
    expect(validateArea('Indiranagar'), isNull);
    expect(validateCity('560038'), isNotNull);
    expect(validateCity(''), isNotNull);
    expect(validateCity('Bengaluru'), isNull);
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
      expect(photoProblem(mime: 'image/jpeg', bytes: maxPhotoBytes + 1),
          isNotNull);
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
