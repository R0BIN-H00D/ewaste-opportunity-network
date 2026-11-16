const maxOrderQuantity = 50;

String? validateEnquiry(String? value) {
  final text = (value ?? '').trim();
  if (text.length < 5) return 'Write a short question for the seller';
  if (text.length > 1000) return 'Please keep this under 1000 characters';
  return null;
}

String? validateDeliveryArea(String? value) => (value ?? '').trim().length > 150 ? 'Please keep this under 150 characters' : null;

String? validateOrderNotes(String? value) => (value ?? '').trim().length > 500 ? 'Please keep this under 500 characters' : null;
