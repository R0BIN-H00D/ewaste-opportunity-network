/// What the address service knows about a spot: the area and city to put in a form, and for a search result the point itself.
class GeoPlace {
  const GeoPlace({this.label = '', this.area = '', this.city = '', this.lat, this.lng});

  final String label;
  final String area;
  final String city;

  /// Only set on search results (a reverse lookup starts from a point, so it has no need to repeat it).
  final double? lat;
  final double? lng;

  bool get isEmpty => area.isEmpty && city.isEmpty;
  bool get hasPoint => lat != null && lng != null;

  factory GeoPlace.fromJson(Map<String, dynamic> json) => GeoPlace(
        label: json['label'] as String? ?? '',
        area: (json['area'] as String? ?? '').trim(),
        city: (json['city'] as String? ?? '').trim(),
        lat: (json['lat'] as num?)?.toDouble(),
        lng: (json['lng'] as num?)?.toDouble(),
      );
}
