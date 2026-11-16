// Client-side checks that mirror the server's rules (backend/src/validators/auth.validators.js) so people get an answer
// before a round trip. The server still has the last word and its messages are shown next to the fields.

final _email = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');
final _phone = RegExp(r'^\+?[0-9\s-]{7,15}$');

String? validateEmail(String? value) {
  final text = (value ?? '').trim();
  if (text.isEmpty) return 'Enter your email';
  if (!_email.hasMatch(text)) return 'Enter a valid email address';
  return null;
}

/// For signing in: any non-empty password (the server decides whether it is right).
String? validateLoginPassword(String? value) => (value == null || value.isEmpty) ? 'Enter your password' : null;

/// For choosing a password: 8-72 characters with at least one letter and one number.
String? validateNewPassword(String? value) {
  final text = value ?? '';
  if (text.isEmpty) return 'Choose a password';
  if (text.length < 8) return 'Use at least 8 characters';
  if (text.length > 72) return 'Use at most 72 characters';
  if (!RegExp(r'[A-Za-z]').hasMatch(text)) return 'Include at least one letter';
  if (!RegExp(r'\d').hasMatch(text)) return 'Include at least one number';
  return null;
}

String? validateName(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 2) return 'Enter your name';
  if (text.length > 80) return 'Use at most 80 characters';
  return null;
}

/// Phone is optional; when given it must look like a phone number.
String? validatePhone(String? value) {
  final text = (value ?? '').trim();
  if (text.isEmpty) return null;
  return _phone.hasMatch(text) ? null : 'Enter a valid phone number';
}

String? validateOrganization(String? value) {
  final text = (value ?? '').trim();
  return text.length < 2 ? 'Enter your organisation name' : null;
}

/// The reset code from the email: the server accepts 20-200 characters.
String? validateResetToken(String? value) {
  final text = (value ?? '').trim();
  if (text.isEmpty) return 'Paste the code from your email';
  if (text.length < 20) return 'That code looks too short';
  return null;
}
