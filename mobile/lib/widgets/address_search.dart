import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../core/network/api_exception.dart';
import '../models/geo_place.dart';
import '../providers/location_providers.dart';

/// Type an address, press search, choose one of the places found. It searches only when asked (never while typing), because
/// the free address service allows very little traffic. When it cannot be reached the person is told so and can still pick on
/// the map or type the area and city themselves.
class AddressSearch extends ConsumerStatefulWidget {
  const AddressSearch(
      {super.key, required this.onPicked, this.label = 'Search an address'});

  final ValueChanged<GeoPlace> onPicked;
  final String label;

  @override
  ConsumerState<AddressSearch> createState() => _AddressSearchState();
}

class _AddressSearchState extends ConsumerState<AddressSearch> {
  final _text = TextEditingController();
  bool _busy = false;
  String? _problem;
  List<GeoPlace>? _results;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _search() async {
    final q = _text.text.trim();
    if (q.length < 3) {
      setState(() {
        _problem = 'Type at least three letters of the address.';
        _results = null;
      });
      return;
    }
    FocusScope.of(context).unfocus();
    setState(() {
      _busy = true;
      _problem = null;
    });
    try {
      final found = await ref.read(geoRepositoryProvider).search(q);
      if (!mounted) return;
      setState(() {
        _busy = false;
        _results = found;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _results = null;
        _problem =
            '${e.message} You can still pick a spot on the map or type the area and city.';
      });
    }
  }

  void _choose(GeoPlace place) {
    setState(() {
      _results = null;
      _text.text = place.label;
    });
    widget.onPicked(place);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final results = _results;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _text,
                textInputAction: TextInputAction.search,
                onSubmitted: (_) => _search(),
                decoration: InputDecoration(
                    labelText: widget.label,
                    prefixIcon: const Icon(Icons.search)),
              ),
            ),
            const SizedBox(width: 8),
            IconButton.filled(
              tooltip: 'Search',
              onPressed: _busy ? null : _search,
              icon: _busy
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.arrow_forward),
            ),
          ],
        ),
        if (_problem != null)
          Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(_problem!,
                  style: theme.textTheme.bodyMedium
                      ?.copyWith(color: theme.colorScheme.error))),
        if (results != null && results.isEmpty)
          Padding(
              padding: const EdgeInsets.only(top: 8),
              child: Text(
                  'No places found. Try a landmark, the area or the city.',
                  style: theme.textTheme.bodyMedium)),
        if (results != null && results.isNotEmpty)
          // A Material of its own, so the tap ripple shows even inside a glass card.
          for (final place in results)
            Material(
              type: MaterialType.transparency,
              child: ListTile(
                dense: true,
                contentPadding: EdgeInsets.zero,
                leading: const Icon(Icons.place_outlined),
                title: Text(place.label, maxLines: 2, overflow: TextOverflow.ellipsis),
                onTap: place.hasPoint ? () => _choose(place) : null,
              ),
            ),
      ],
    );
  }
}
