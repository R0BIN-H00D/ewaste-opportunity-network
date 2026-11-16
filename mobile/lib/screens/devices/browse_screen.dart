import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../providers/listings_controller.dart';
import '../../widgets/app_chip.dart';
import 'filter_sheet.dart';
import 'listings_view.dart';

/// Everyone's live listings: search, a quick choice of service, and a filter sheet for the rest.
class BrowseScreen extends ConsumerStatefulWidget {
  const BrowseScreen({super.key});

  @override
  ConsumerState<BrowseScreen> createState() => _BrowseScreenState();
}

class _BrowseScreenState extends ConsumerState<BrowseScreen> {
  final _search = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  ListingsController get _controller => ref.read(listingsProvider(false).notifier);

  // Wait for a pause in typing, so the server is asked once per word and not once per letter.
  void _onSearchChanged(String text) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => _controller.setQuery((q) => q.copyWith(q: text)));
  }

  void _searchNow(String text) {
    _debounce?.cancel();
    _controller.setQuery((q) => q.copyWith(q: text));
  }

  Future<void> _openFilters() async {
    final current = ref.read(listingsProvider(false)).query;
    final chosen = await FilterSheet.show(context, current);
    if (chosen == null || !mounted) return;
    await _controller.setQuery((q) => q.copyWith(category: chosen.category, condition: chosen.condition, sort: chosen.sort, city: chosen.city));
  }

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(listingsProvider(false).select((s) => s.query));
    final filters = query.activeFilters;

    final header = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _search,
                textInputAction: TextInputAction.search,
                onChanged: (text) {
                  setState(() {}); // shows or hides the clear button
                  _onSearchChanged(text);
                },
                onSubmitted: _searchNow,
                decoration: InputDecoration(
                  labelText: 'Search devices',
                  prefixIcon: const Icon(Icons.search),
                  suffixIcon: _search.text.isEmpty
                      ? null
                      : IconButton(
                          tooltip: 'Clear search',
                          icon: const Icon(Icons.close),
                          onPressed: () {
                            _search.clear();
                            _searchNow('');
                            setState(() {});
                          },
                        ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            Semantics(
              button: true,
              label: filters == 0 ? 'Filters' : 'Filters, $filters on',
              excludeSemantics: true,
              child: SizedBox(
                width: 56,
                height: 56,
                child: Badge(
                  isLabelVisible: filters > 0,
                  label: Text('$filters'),
                  child: OutlinedButton(
                    onPressed: _openFilters,
                    style: OutlinedButton.styleFrom(padding: EdgeInsets.zero, minimumSize: const Size(56, 56)),
                    child: const Icon(Icons.tune),
                  ),
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              AppChip(label: 'All', selected: query.service.isEmpty, onTap: () => _controller.setQuery((q) => q.copyWith(service: ''))),
              for (final (value, label) in services) ...[
                const SizedBox(width: 8),
                AppChip(label: label, selected: query.service == value, onTap: () => _controller.setQuery((q) => q.copyWith(service: value))),
              ],
            ],
          ),
        ),
      ],
    );

    return ListingsView(
      mine: false,
      header: header,
      emptyTitle: 'No devices found',
      emptyMessage: 'Try a different search, or clear the filters.',
    );
  }
}
