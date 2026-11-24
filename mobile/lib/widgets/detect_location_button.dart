import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../core/network/api_exception.dart';
import '../models/geo_place.dart';
import '../providers/location_providers.dart';
import '../services/location_service.dart';

/// "Detect my current location": reads where the phone is, looks up the address for that spot and hands both to the form,
/// which fills itself in. If the phone's GPS is off an alert asks the person to turn it on (and the button tries again by
/// itself when they come back). If the address lookup is out of reach the form is left for the person to type.
class DetectLocationButton extends ConsumerStatefulWidget {
  const DetectLocationButton({super.key, required this.onDetected, this.label = 'Detect my current location'});

  /// Called with the spot and the address found for it (`null` when the address service could not say).
  final void Function(GeoPoint point, GeoPlace? place) onDetected;
  final String label;

  @override
  ConsumerState<DetectLocationButton> createState() => _DetectLocationButtonState();
}

class _DetectLocationButtonState extends ConsumerState<DetectLocationButton> with WidgetsBindingObserver {
  bool _busy = false;

  // Set when the person was sent to the phone's settings: when they return, try again without another tap.
  bool _retryOnResume = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _retryOnResume && !_busy) {
      _retryOnResume = false;
      _detect();
    }
  }

  void _say(String message) {
    if (!mounted) return;
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(SnackBar(content: Text(message)));
  }

  /// An alert with one way forward ([action]) and one way out.
  Future<bool> _alert({required String title, required String message, required String action}) async {
    final go = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: Text(message),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: const Text('Not now')),
          FilledButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text(action)),
        ],
      ),
    );
    return go == true;
  }

  Future<void> _detect() async {
    if (_busy) return;
    setState(() => _busy = true);
    final location = ref.read(locationServiceProvider);
    final result = await location.current();
    if (!mounted) return;
    setState(() => _busy = false);

    switch (result.problem) {
      case LocationProblem.serviceOff:
        // GPS is off: ask to turn it on, and carry on by itself when they come back.
        final go = await _alert(
          title: 'Turn on GPS',
          message: 'Location is switched off on your phone. Turn on GPS to fill in your address automatically.',
          action: 'Turn on GPS',
        );
        if (go) {
          _retryOnResume = true;
          await location.openLocationSettings();
        }
        return;
      case LocationProblem.denied:
        final go = await _alert(
          title: 'Allow location',
          message: 'To fill in your address, the app needs permission to use your location.',
          action: 'Try again',
        );
        if (go) await _detect();
        return;
      case LocationProblem.deniedForever:
        final go = await _alert(
          title: 'Location is blocked',
          message: 'Location is blocked for this app. Allow it in the phone settings to fill in your address automatically.',
          action: 'Open settings',
        );
        if (go) {
          _retryOnResume = true;
          await location.openAppSettings();
        }
        return;
      case LocationProblem.unavailable:
        final go = await _alert(
          title: 'Could not find you',
          message: 'The phone could not find where it is just now. Try again outside, or type the address yourself.',
          action: 'Try again',
        );
        if (go) await _detect();
        return;
      case null:
        break;
    }

    final point = result.point!;
    setState(() => _busy = true);
    GeoPlace? place;
    try {
      place = await ref.read(geoRepositoryProvider).reverse(point.lat, point.lng);
    } on ApiException {
      place = null; // the address service is optional: the form is left for the person to type
    }
    if (!mounted) return;
    setState(() => _busy = false);
    final found = place != null && !place.isEmpty;
    widget.onDetected(point, found ? place : null);
    _say(found
        ? 'Location detected: ${[place.area, place.city].where((s) => s.isNotEmpty).join(', ')}'
        : 'Location found, but we could not look up the address. Please type it.');
  }

  @override
  Widget build(BuildContext context) {
    return OutlinedButton.icon(
      onPressed: _busy ? null : _detect,
      icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.my_location),
      label: Text(_busy ? 'Detecting…' : widget.label),
      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
    );
  }
}
