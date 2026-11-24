import 'dart:convert';
import '../core/listing_validation.dart';

/// What a person fills in to list a device. Empty optional values are left out of what is sent.
class ListingInput {
  const ListingInput({
    required this.name,
    required this.category,
    required this.condition,
    required this.preferredService,
    this.brand = '',
    this.model = '',
    this.modelYear = '',
    this.purchaseYear = '',
    this.description = '',
    this.conditionDetails = const {},
    this.expectedPrice = '',
    this.pickupPreference = '',
    this.addressArea = '',
    this.city = '',
    this.agentPhone = '',
    this.lat,
    this.lng,
    this.draft = false,
  });

  final String name;

  /// The category's slug.
  final String category;
  final String condition;
  final String preferredService;
  final String brand;
  final String model;
  final String modelYear;
  final String purchaseYear;
  final String description;

  /// How each part is doing (`battery` -> `drains_fast`, ...). Only answered parts; empty means nothing to say.
  final Map<String, String> conditionDetails;
  final String expectedPrice;
  final String pickupPreference;
  final String addressArea;
  final String city;
  final String agentPhone;

  /// Where the device is, if the person shared it or placed a pin. Both or neither: the server refuses one alone.
  final double? lat;
  final double? lng;

  /// Save without publishing.
  final bool draft;


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
    add('modelYear', modelYear);
    add('purchaseYear', purchaseYear);
    add('description', description);
    final answered = {for (final e in conditionDetails.entries) if (e.value.isNotEmpty) e.key: e.value};
    if (answered.isNotEmpty) fields['conditionDetails'] = jsonEncode(answered);
    add('expectedPrice', expectedPrice.replaceAll(',', ''));
    add('pickupPreference', pickupPreference);
    add('addressArea', addressArea);
    add('city', city);
    add('agentPhone', normalizePhone(agentPhone));
    if (lat != null && lng != null) {
      fields['lat'] = lat!.toStringAsFixed(5);
      fields['lng'] = lng!.toStringAsFixed(5);
    }
    return fields;
  }
}
