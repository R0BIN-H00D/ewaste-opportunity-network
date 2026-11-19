import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/listing.dart';
import '../../services/marketplace_repository.dart';
import '../../widgets/app_chip.dart';

/// Category, condition and sort order for the shop, in one sheet instead of three rows of chips on the page.
/// Nothing changes until "Show results".
class ShopFilterSheet extends StatefulWidget {
  const ShopFilterSheet({super.key, required this.initial, required this.categories});

  final ProductQuery initial;
  final List<Category> categories;

  /// Opens the sheet and returns the chosen query, or `null` if it was closed without choosing.
  static Future<ProductQuery?> show(BuildContext context, ProductQuery initial, List<Category> categories) {
    return showModalBottomSheet<ProductQuery>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => ShopFilterSheet(initial: initial, categories: categories),
    );
  }

  @override
  State<ShopFilterSheet> createState() => _ShopFilterSheetState();
}

class _ShopFilterSheetState extends State<ShopFilterSheet> {
  late String _category = widget.initial.category;
  late String _condition = widget.initial.condition;
  late String _sort = widget.initial.sort;

  void _clear() => setState(() {
        _category = '';
        _condition = '';
        _sort = 'newest';
      });

  Widget _section(ThemeData theme, IconData icon, String title, List<Widget> chips) => Padding(
        padding: const EdgeInsets.only(top: 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(icon, size: 18, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Expanded(child: Semantics(header: true, child: Text(title, style: theme.textTheme.titleSmall))),
              ],
            ),
            const SizedBox(height: 10),
            Wrap(spacing: 8, runSpacing: 8, children: chips),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(child: Text('Filter the shop', style: theme.textTheme.titleLarge)),
                TextButton(onPressed: _clear, child: const Text('Clear all')),
              ],
            ),
            if (widget.categories.isNotEmpty)
              _section(theme, Icons.category_outlined, 'Category', [
                AppChip(label: 'All devices', selected: _category.isEmpty, onTap: () => setState(() => _category = '')),
                for (final c in widget.categories) AppChip(label: c.name, selected: _category == c.slug, onTap: () => setState(() => _category = c.slug)),
              ]),
            _section(theme, Icons.verified_outlined, 'Condition', [
              AppChip(label: 'Any condition', selected: _condition.isEmpty, onTap: () => setState(() => _condition = '')),
              for (final (value, label) in productConditions) AppChip(label: label, selected: _condition == value, onTap: () => setState(() => _condition = value)),
            ]),
            _section(theme, Icons.swap_vert_rounded, 'Sort by', [
              for (final (value, label) in productSorts) AppChip(label: label, selected: _sort == value, onTap: () => setState(() => _sort = value)),
            ]),
            const SizedBox(height: 24),
            FilledButton(
              onPressed: () => Navigator.of(context).pop(widget.initial.copyWith(category: _category, condition: _condition, sort: _sort)),
              child: const Text('Show results'),
            ),
          ],
        ),
      ),
    );
  }
}
