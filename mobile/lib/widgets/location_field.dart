import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../models/geo_place.dart';
import '../routes/route_paths.dart';
import '../services/location_service.dart';
import 'address_search.dart';
import 'detect_location_button.dart';
import 'glass_container.dart';

/// Lets a person share where a device is: their phone's position (with the address filled in for them), a pin on the map, or a
/// typed address. It is always optional. If the phone's GPS is off an alert asks to turn it on, and the city and area can
/// always be typed, so nobody is stuck.
class LocationField extends ConsumerStatefulWidget {
  const LocationField({
    super.key,
    required this.value,
    required this.onChanged,
    this.onDetected,
    this.title = 'Where is it? (optional)',
    this.blurb = 'This helps people nearby find it. Others only see a blurred spot, never your exact address.',
  });

  final GeoPoint? value;
  final ValueChanged<GeoPoint?> onChanged;

  /// Called when "Detect my current location" finds the spot and its address, so the form can fill itself in. When it is not
  /// given the spot is passed to [onChanged] like any other.
  final void Function(GeoPoint point, GeoPlace? place)? onDetected;
  final String title;
  final String blurb;

  @override
  ConsumerState<LocationField> createState() => _LocationFieldState();
}

class _LocationFieldState extends ConsumerState<LocationField> {
  Future<void> _pickOnMap() async {
    final picked = await context.push<GeoPoint>(Routes.pickLocation, extra: widget.value);
    if (picked != null && mounted) widget.onChanged(picked);
  }

  /// An address was chosen from the search: it becomes the shared spot, and the form fills in the area and city from it.
  void _useAddress(GeoPlace place) => widget.onChanged(GeoPoint(place.lat!, place.lng!).rounded());

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final value = widget.value;
    return GlassContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(header: true, child: Text(widget.title, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16))),
          const SizedBox(height: 4),
          Text(widget.blurb, style: theme.textTheme.bodyMedium),
          const SizedBox(height: 12),
          if (value != null) ...[
            Row(
              children: [
                Icon(Icons.check_circle_outline, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Expanded(child: Text('Location saved (${value.label})', style: theme.textTheme.bodyLarge)),
                TextButton(onPressed: () => widget.onChanged(null), child: const Text('Remove')),
              ],
            ),
            const SizedBox(height: 8),
          ],
          DetectLocationButton(onDetected: (point, place) => (widget.onDetected ?? (p, _) => widget.onChanged(p))(point, place)),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _pickOnMap,
            icon: const Icon(Icons.pin_drop_outlined),
            label: const Text('Pick on map'),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          ),
          const SizedBox(height: 12),
          AddressSearch(onPicked: _useAddress),
        ],
      ),
    );
  }
}
