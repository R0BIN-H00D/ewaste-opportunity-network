import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../providers/listings_controller.dart';
import '../../services/device_repository.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/app_text_field.dart';

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
            _section('Sort by', [
              for (final (value, label) in sorts) AppChip(label: label, selected: _sort == value, onTap: () => setState(() => _sort = value)),
            ]),
            const SizedBox(height: 16),
            AppTextField(controller: _city, label: 'City', icon: Icons.location_city_outlined, textInputAction: TextInputAction.done),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(widget.initial.copyWith(category: _category, condition: _condition, sort: _sort, city: _city.text)),
              child: const Text('Show results'),
            ),
          ],
        ),
      ),
    );
  }
}
