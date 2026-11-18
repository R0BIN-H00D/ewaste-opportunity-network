const maxOrderQuantity = 50;

String? validateEnquiry(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 5) return 'Write a short question for the seller';
  if (text.length > 1000) return 'Please keep this under 1000 characters';
  return null;
}

String? validateDeliveryArea(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 3 || !RegExp(r'[A-Za-z]').hasMatch(text))
    return 'Enter the area or locality to deliver to';
  if (text.length > 150) return 'Please keep this under 150 characters';
  return null;
}

String? validateDeliveryCity(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 2 || !RegExp(r"^[A-Za-z][A-Za-z .'-]*$").hasMatch(text))
    return 'Enter the city (letters only)';
  if (text.length > 80) return 'Please keep this under 80 characters';
  return null;
}

String? validateDeliveryPincode(String? value) =>
    RegExp(r'^[1-9][0-9]{5}$').hasMatch((value ?? '').trim())
        ? null
        : 'Enter a valid 6-digit pincode';

String? validateOrderNotes(String? value) => (value ?? '').trim().length > 500
    ? 'Please keep this under 500 characters'
    : null;
