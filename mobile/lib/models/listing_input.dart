/// What a person fills in to list a device. Empty optional values are left out of what is sent.
class ListingInput {
  const ListingInput({
    required this.name,
    required this.category,
    required this.condition,
    required this.preferredService,
    this.brand = '',
    this.model = '',
    this.purchaseYear = '',
    this.description = '',
    this.expectedPrice = '',
    this.pickupPreference = '',
    this.addressArea = '',
    this.city = '',
    this.lat,
    this.lng,
    this.draft = false,
    this.aiSuggestionJson = '',
  });

  final String name;

  /// The category's slug.
  final String category;
  final String condition;
  final String preferredService;
  final String brand;
  final String model;
  final String purchaseYear;
  final String description;
  final String expectedPrice;
  final String pickupPreference;
  final String addressArea;
  final String city;

  /// Where the device is, if the person shared it or placed a pin. Both or neither: the server refuses one alone.
  final double? lat;
  final double? lng;

  /// Save without publishing.
  final bool draft;

  /// The AI suggestion the person accepted, as JSON, kept with the listing (FR-AI-002). Empty when none was used.
  final String aiSuggestionJson;

  Map<String, String> toFields() {
    final fields = <String, String>{
      'name': name.trim(),
      'category': category,
      'condition': condition,
      'preferredService': preferredService,
      'status': draft ? 'draft' : 'listed',
    };
    void add(String key, String value) {
      final text = value.trim();
      if (text.isNotEmpty) fields[key] = text;
    }

    add('brand', brand);
    add('model', model);
    add('purchaseYear', purchaseYear);
    add('description', description);
    add('expectedPrice', expectedPrice.replaceAll(',', ''));
    add('pickupPreference', pickupPreference);
    add('addressArea', addressArea);
    add('city', city);
    add('aiSuggestion', aiSuggestionJson);
    if (lat != null && lng != null) {
      fields['lat'] = lat!.toStringAsFixed(5);
      fields['lng'] = lng!.toStringAsFixed(5);
    }
    return fields;
  }
}
