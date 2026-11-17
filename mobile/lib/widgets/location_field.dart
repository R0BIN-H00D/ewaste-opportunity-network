import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../models/geo_place.dart';
import '../providers/location_providers.dart';
import '../routes/route_paths.dart';
import '../services/location_service.dart';
import 'address_search.dart';
import 'glass_container.dart';
import 'message_banner.dart';

/// Lets a person share where a device is: their phone's position, or a pin on the map. It is always optional. When the
/// phone will not say where it is (permission refused, location off, no signal) the screen explains why and says the
/// city and area still work, so nobody is stuck.
class LocationField extends ConsumerStatefulWidget {
  const LocationField({super.key, required this.value, required this.onChanged});

  final GeoPoint? value;
  final ValueChanged<GeoPoint?> onChanged;

  @override
  ConsumerState<LocationField> createState() => _LocationFieldState();
}

class _LocationFieldState extends ConsumerState<LocationField> {
  bool _busy = false;
  LocationProblem? _problem;

  Future<void> _useCurrent() async {
    setState(() {
      _busy = true;
      _problem = null;
    });
    final result = await ref.read(locationServiceProvider).current();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _problem = result.problem;
    });
    if (result.point != null) widget.onChanged(result.point);
  }

  Future<void> _pickOnMap() async {
    final picked = await context.push<GeoPoint>(Routes.pickLocation, extra: widget.value);
    if (picked != null && mounted) {
      setState(() => _problem = null);
      widget.onChanged(picked);
    }
  }

  /// An address was chosen from the search: it becomes the shared spot, and the form fills in the area and city from it.
  void _useAddress(GeoPlace place) {
    setState(() => _problem = null);
    widget.onChanged(GeoPoint(place.lat!, place.lng!).rounded());
  }

  (String, String, VoidCallback)? _help() {
    switch (_problem) {
      case LocationProblem.denied:
        return ('Location was not allowed, so nothing was shared. You can try again, pick a spot on the map, or just fill in the city and area.', 'Try again', _useCurrent);
      case LocationProblem.deniedForever:
        return ('Location is blocked for this app. Allow it in the phone settings, or pick a spot on the map, or just fill in the city and area.', 'Open settings', () => ref.read(locationServiceProvider).openAppSettings());
      case LocationProblem.serviceOff:
        return ('Location is switched off on this phone. Turn it on, or pick a spot on the map, or just fill in the city and area.', 'Turn on', () => ref.read(locationServiceProvider).openLocationSettings());
      case LocationProblem.unavailable:
        return ('The phone could not find where it is just now. Try again outside, pick a spot on the map, or just fill in the city and area.', 'Try again', _useCurrent);
      case null:
        return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final help = _help();
    final value = widget.value;
    return GlassContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(header: true, child: Text('Where is it? (optional)', style: theme.textTheme.titleLarge?.copyWith(fontSize: 16))),
          const SizedBox(height: 4),
          Text('This helps people nearby find it. Others only see a blurred spot, never your exact address.', style: theme.textTheme.bodyMedium),
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
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              OutlinedButton.icon(
                onPressed: _busy ? null : _useCurrent,
                icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.my_location),
                label: Text(_busy ? 'Finding you...' : 'Use my location'),
              ),
              OutlinedButton.icon(
                onPressed: _busy ? null : _pickOnMap,
                icon: const Icon(Icons.pin_drop_outlined),
                label: const Text('Pick on map'),
              ),
            ],
          ),
          const SizedBox(height: 12),
          AddressSearch(onPicked: _useAddress),
          if (help != null) ...[
            const SizedBox(height: 12),
            MessageBanner(tone: BannerTone.warning, message: help.$1, action: TextButton(onPressed: help.$3, child: Text(help.$2))),
          ],
        ],
      ),
    );
  }
}
