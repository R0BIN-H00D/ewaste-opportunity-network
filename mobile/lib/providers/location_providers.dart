import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../services/geo_repository.dart';
import '../services/location_service.dart';
import 'core_providers.dart';

/// Overridden with a fake in tests.
final locationServiceProvider = Provider<LocationService>((ref) => GeolocatorLocationService());

/// The address service, for filling in the area and city from a point. Overridden with a fake in tests.
final geoRepositoryProvider = Provider<GeoRepository>((ref) => GeoRepository(ref.watch(apiClientProvider)));
