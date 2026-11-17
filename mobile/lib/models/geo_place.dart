/// What the address service knows about a spot: the area and city to put in a form.
class GeoPlace {
  const GeoPlace({this.label = '', this.area = '', this.city = ''});

  final String label;
  final String area;
  final String city;

  bool get isEmpty => area.isEmpty && city.isEmpty;

  factory GeoPlace.fromJson(Map<String, dynamic> json) => GeoPlace(
        label: json['label'] as String? ?? '',
        area: (json['area'] as String? ?? '').trim(),
        city: (json['city'] as String? ?? '').trim(),
      );
}