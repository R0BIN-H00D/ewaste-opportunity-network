import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../providers/listings_controller.dart';
import '../../providers/location_providers.dart';
import '../../services/device_repository.dart';
import '../../services/location_service.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/app_text_field.dart';
import '../../widgets/message_banner.dart';

/// Category, condition, city and sort order for Browse. Nothing changes until "Show results".
class FilterSheet extends ConsumerStatefulWidget {
  const FilterSheet({super.key, required this.initial});

  final ListingQuery initial;

  /// Opens the sheet and returns the chosen query, or `null` if it was closed without choosing.
  static Future<ListingQuery?> show(BuildContext context, ListingQuery initial) {
    return showModalBottomSheet<ListingQuery>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => FilterSheet(initial: initial),
    );
  }

  @override
  ConsumerState<FilterSheet> createState() => _FilterSheetState();
}

class _FilterSheetState extends ConsumerState<FilterSheet> {
  late String _category = widget.initial.category;
  late String _condition = widget.initial.condition;
  late String _sort = widget.initial.sort;
  late final TextEditingController _city = TextEditingController(text: widget.initial.city);

  // "Near me": a point and a distance. Switching it on asks the phone where it is; if that fails the chip stays off and says why.
  late double? _lat = widget.initial.lat;
  late double? _lng = widget.initial.lng;
  late int? _radius = widget.initial.radiusKm;
  bool _locating = false;
  String? _nearNote;

  static const _radii = [5, 10, 25, 50];

  Future<void> _chooseRadius(int? km) async {
    if (_locating) return;
    if (km == null) {
      setState(() {
        _lat = _lng = _radius = null;
        _nearNote = null;
      });
      return;
    }
    if (_lat != null && _lng != null) {
      setState(() => _radius = km);
      return;
    }
    setState(() {
      _locating = true;
      _nearNote = null;
    });
    final result = await ref.read(locationServiceProvider).current();
    if (!mounted) return;
    setState(() {
      _locating = false;
      if (result.point != null) {
        _lat = result.point!.lat;
        _lng = result.point!.lng;
        _radius = km;
      } else {
        _nearNote = switch (result.problem) {
          LocationProblem.deniedForever => 'Location is blocked for this app. Allow it in the phone settings, or type a city below.',
          LocationProblem.serviceOff => 'Location is switched off on this phone. Turn it on, or type a city below.',
          LocationProblem.denied => 'Location was not allowed. You can still type a city below.',
          _ => 'The phone could not find where it is just now. Try again, or type a city below.',
        };
      }
    });
  }

  @override
  void dispose() {
    _city.dispose();
    super.dispose();
  }

  void _clear() => setState(() {
        _category = '';
        _condition = '';
        _sort = 'newest';
        _city.clear();
        _lat = _lng = _radius = null;
        _nearNote = null;
      });

  Widget _section(String title, List<Widget> chips) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 16),
          Semantics(header: true, child: Text(title, style: Theme.of(context).textTheme.titleLarge?.copyWith(fontSize: 16))),
          const SizedBox(height: 8),
          Wrap(spacing: 8, runSpacing: 8, children: chips),
        ],
      );

  @override
  Widget build(BuildContext context) {
    final categories = ref.watch(categoriesProvider);
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + bottomInset),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text('Filters', style: Theme.of(context).textTheme.headlineMedium)),
                TextButton(onPressed: _clear, child: const Text('Clear all')),
              ],
            ),
            categories.when(
              data: (list) => _section('Category', [
                AppChip(label: 'Any', selected: _category.isEmpty, onTap: () => setState(() => _category = '')),
                for (final c in list) AppChip(label: c.name, selected: _category == c.slug, onTap: () => setState(() => _category = c.slug)),
              ]),
              loading: () => const Padding(padding: EdgeInsets.only(top: 16), child: LinearProgressIndicator()),
              // The rest of the filters still work without categories.
              error: (_, __) => const SizedBox.shrink(),
            ),
            _section('Condition', [
              AppChip(label: 'Any', selected: _condition.isEmpty, onTap: () => setState(() => _condition = '')),
              for (final (value, label) in conditions) AppChip(label: label, selected: _condition == value, onTap: () => setState(() => _condition = value)),
            ]),
            _section('Near me', [
              AppChip(label: 'Any distance', selected: _radius == null, onTap: () => _chooseRadius(null)),
              for (final km in _radii) AppChip(label: '$km km', selected: _radius == km, onTap: () => _chooseRadius(km)),
            ]),
            if (_locating) const Padding(padding: EdgeInsets.only(top: 8), child: LinearProgressIndicator()),
            if (_nearNote != null) Padding(padding: const EdgeInsets.only(top: 8), child: MessageBanner(tone: BannerTone.warning, message: _nearNote!)),
            _section('Sort by', [
              for (final (value, label) in sorts) AppChip(label: label, selected: _sort == value, onTap: () => setState(() => _sort = value)),
            ]),
            const SizedBox(height: 16),
            AppTextField(controller: _city, label: 'City', icon: Icons.location_city_outlined, textInputAction: TextInputAction.done),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () {
                final base = widget.initial.copyWith(category: _category, condition: _condition, sort: _sort, city: _city.text, clearNearby: true);
                Navigator.of(context).pop(_radius == null ? base : base.copyWith(lat: _lat, lng: _lng, radiusKm: _radius));
              },
              child: const Text('Show results'),
            ),
          ],
        ),
      ),
    );
  }
}
