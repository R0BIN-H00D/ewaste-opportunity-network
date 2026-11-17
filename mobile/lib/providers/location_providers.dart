import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/location_service.dart';

/// Overridden with a fake in tests.
final locationServiceProvider = Provider<LocationService>((ref) => GeolocatorLocationService());
