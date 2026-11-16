import 'package:ewaste_opportunity/core/validation.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('email', () {
    expect(validateEmail(''), isNotNull);
    expect(validateEmail('   '), isNotNull);
    expect(validateEmail('asha'), isNotNull);
    expect(validateEmail('asha@example'), isNotNull);
    expect(validateEmail('asha@example.com'), isNull);
    expect(validateEmail(' asha@example.com '), isNull);
  });

  test('login password only needs to be present', () {
    expect(validateLoginPassword(''), isNotNull);
    expect(validateLoginPassword(null), isNotNull);
    expect(validateLoginPassword('x'), isNull);
  });

  test('new password follows the server rules', () {
    expect(validateNewPassword(''), isNotNull);
    expect(validateNewPassword('abc123'), 'Use at least 8 characters');
    expect(validateNewPassword('abcdefgh'), 'Include at least one number');
    expect(validateNewPassword('12345678'), 'Include at least one letter');
    expect(validateNewPassword('a1' * 37), 'Use at most 72 characters');
    expect(validateNewPassword('Demo@12345'), isNull);
    expect(validateNewPassword('a1' * 36), isNull);
  });

  test('name', () {
    expect(validateName('A'), isNotNull);
    expect(validateName('  '), isNotNull);
    expect(validateName('Asha Rao'), isNull);
  });

  test('phone is optional but must look like a phone number', () {
    expect(validatePhone(''), isNull);
    expect(validatePhone(null), isNull);
    expect(validatePhone('+91 98765 43210'), isNull);
    expect(validatePhone('12'), isNotNull);
    expect(validatePhone('call me'), isNotNull);
  });

  test('organisation and reset code', () {
    expect(validateOrganization(''), isNotNull);
    expect(validateOrganization('GreenCycle Ltd'), isNull);
    expect(validateResetToken(''), isNotNull);
    expect(validateResetToken('short'), isNotNull);
    expect(validateResetToken('a' * 40), isNull);
  });
}
