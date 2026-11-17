import 'package:flutter_map/flutter_map.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart' as ll;
import 'package:material_ui/material_ui.dart';
import '../../services/location_service.dart';
import '../../models/geo_place.dart';
import '../../widgets/address_search.dart';
import '../../widgets/glass_app_bar.dart';

/// Where the map opens when there is no saved point yet: the middle of India, zoomed out, so the person looks for their own area.
const _fallbackCentre = GeoPoint(20.5937, 78.9629);

/// Tap the map to drop a pin, then "Use this spot". Pops with the chosen [GeoPoint], or nothing if the person goes back.
/// The tiles are OpenStreetMap's, which asks for visible credit and an app name in the request.
class PinPickerScreen extends StatefulWidget {
  const PinPickerScreen({super.key, this.initial});

  final GeoPoint? initial;

  @override
  State<PinPickerScreen> createState() => _PinPickerScreenState();
}

class _PinPickerScreenState extends State<PinPickerScreen> {
  late GeoPoint? _pin = widget.initial;
  final _map = MapController();

  /// An address was chosen from the search: put the pin there and bring it into view.
  void _goTo(GeoPlace place) {
    final point = GeoPoint(place.lat!, place.lng!).rounded();
    setState(() => _pin = point);
    _map.move(ll.LatLng(point.lat, point.lng), 16);
  }

  @override
  void dispose() {
    _map.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final centre = _pin ?? _fallbackCentre;
    final pin = _pin;
    return Scaffold(
      appBar: glassAppBar(context, 'Pick a spot'),
      body: Stack(
        children: [
          FlutterMap(
            mapController: _map,
            options: MapOptions(
              initialCenter: ll.LatLng(centre.lat, centre.lng),
              initialZoom: _pin == null ? 4.5 : 15,
              minZoom: 3,
              onTap: (_, point) => setState(() => _pin = GeoPoint(point.latitude, point.longitude).rounded()),
            ),
            children: [
              TileLayer(urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', userAgentPackageName: 'com.ewaste.ewaste_opportunity'),
              if (pin != null)
                MarkerLayer(markers: [
                  Marker(
                    point: ll.LatLng(pin.lat, pin.lng),
                    width: 48,
                    height: 48,
                    alignment: Alignment.topCenter,
                    child: Icon(Icons.location_on, size: 48, color: theme.colorScheme.error),
                  ),
                ]),
              const RichAttributionWidget(attributions: [TextSourceAttribution('OpenStreetMap contributors')]),
            ],
          ),
          Positioned(
            left: 16,
            right: 16,
            top: 8,
            child: Material(
              color: theme.colorScheme.surface,
              elevation: 4,
              borderRadius: BorderRadius.circular(20),
              child: Padding(padding: const EdgeInsets.fromLTRB(12, 8, 12, 8), child: AddressSearch(onPicked: _goTo, label: 'Search an address or place')),
            ),
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 16,
            child: SafeArea(
              child: Material(
                color: theme.colorScheme.surface,
                elevation: 4,
                borderRadius: BorderRadius.circular(20),
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(pin == null ? 'Search above, or tap the map where the device is.' : 'Pin at ${pin.label}', style: theme.textTheme.bodyLarge),
                      const SizedBox(height: 4),
                      Text('Others only see a blurred spot, never this exact pin.', style: theme.textTheme.bodyMedium),
                      const SizedBox(height: 12),
                      FilledButton(onPressed: pin == null ? null : () => context.pop(pin), child: const Text('Use this spot')),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
