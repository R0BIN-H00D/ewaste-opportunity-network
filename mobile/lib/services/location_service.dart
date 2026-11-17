import 'package:geolocator/geolocator.dart';

/// A point on the map, in degrees. Rounded to five places (about a metre) because that is all a phone knows.
class GeoPoint {
  const GeoPoint(this.lat, this.lng);

  final double lat;
  final double lng;

  GeoPoint rounded() => GeoPoint(double.parse(lat.toStringAsFixed(5)), double.parse(lng.toStringAsFixed(5)));

  /// "12.97160, 77.59460", for showing and for tests.
  String get label => '${lat.toStringAsFixed(5)}, ${lng.toStringAsFixed(5)}';

  @override
  bool operator ==(Object other) => other is GeoPoint && other.lat == lat && other.lng == lng;

  @override
  int get hashCode => Object.hash(lat, lng);
}

/// Why a location could not be had. Each one needs a different message and a different way out.
enum LocationProblem {
  /// The person said no this time. Asking again is allowed.
  denied,

  /// The person said no and chose "don't ask again". Only the phone's settings can change it.
  deniedForever,

  /// Location is switched off on the phone.
  serviceOff,

  /// No fix arrived in time (indoors, no signal) or the phone reported an error.
  unavailable,
}

class LocationResult {
  const LocationResult.found(GeoPoint this.point) : problem = null;
  const LocationResult.failed(LocationProblem this.problem) : point = null;

  final GeoPoint? point;
  final LocationProblem? problem;

  bool get ok => point != null;
}

/// Where the phone is. Behind an interface so that tests and the person's "type it instead" fallback never touch the GPS.
abstract class LocationService {
  /// Asks for permission if needed, then reads the position once. Never throws.
  Future<LocationResult> current();

  /// Opens the phone's settings page for this app (for [LocationProblem.deniedForever]).
  Future<void> openAppSettings();

  /// Opens the phone's location switch (for [LocationProblem.serviceOff]).
  Future<void> openLocationSettings();
}

class GeolocatorLocationService implements LocationService {
  @override
  Future<LocationResult> current() async {
    try {
      if (!await Geolocator.isLocationServiceEnabled()) return const LocationResult.failed(LocationProblem.serviceOff);
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.deniedForever) return const LocationResult.failed(LocationProblem.deniedForever);
      if (permission == LocationPermission.denied || permission == LocationPermission.unableToDetermine) {
        return const LocationResult.failed(LocationProblem.denied);
      }
      // A rough fix is enough: only the area is ever shown to others, and the server blurs it further (BR-08).
      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.medium, timeLimit: Duration(seconds: 15)),
      );
      return LocationResult.found(GeoPoint(position.latitude, position.longitude).rounded());
    } catch (_) {
      return const LocationResult.failed(LocationProblem.unavailable);
    }
  }

  @override
  Future<void> openAppSettings() async {
    await Geolocator.openAppSettings();
  }

  @override
  Future<void> openLocationSettings() async {
    await Geolocator.openLocationSettings();
  }
}
