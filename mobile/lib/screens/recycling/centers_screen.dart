import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../models/recycling.dart';
import '../../providers/listings_controller.dart';
import '../../providers/recycling_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/paged_list.dart';
import 'center_card.dart';

/// The directory of authorised recycling centres: search, a filter by what they accept, and a card for each.
/// [listingId] is the device the person wants to recycle; it is passed on to the request form.
class CentersScreen extends ConsumerStatefulWidget {
  const CentersScreen({super.key, this.listingId});

  final String? listingId;

  @override
  ConsumerState<CentersScreen> createState() => _CentersScreenState();
}

class _CentersScreenState extends ConsumerState<CentersScreen> {
  final _search = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _setQuery(String text) => ref.read(centerQueryProvider.notifier).update((q) => q.copyWith(q: text));

  void _onChanged(String text) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => _setQuery(text));
  }

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(centerQueryProvider);
    final notifier = ref.read(centerQueryProvider.notifier);
    final categories = ref.watch(categoriesProvider).valueOrNull ?? const [];

    final header = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        TextField(
          controller: _search,
          textInputAction: TextInputAction.search,
          onChanged: _onChanged,
          onSubmitted: (text) {
            _debounce?.cancel();
            _setQuery(text);
          },
          decoration: InputDecoration(
            labelText: 'Search by name or city',
            prefixIcon: const Icon(Icons.search),
            suffixIcon: _search.text.isEmpty
                ? null
                : IconButton(
                    tooltip: 'Clear search',
                    icon: const Icon(Icons.close),
                    onPressed: () {
                      _search.clear();
                      _setQuery('');
                      setState(() {});
                    },
                  ),
          ),
        ),
        if (categories.isNotEmpty) ...[
          const SizedBox(height: 12),
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                AppChip(label: 'Any device', selected: query.category.isEmpty, onTap: () => notifier.update((q) => q.copyWith(category: ''))),
                for (final c in categories) ...[
                  const SizedBox(width: 8),
                  AppChip(label: c.name, selected: query.category == c.slug, onTap: () => notifier.update((q) => q.copyWith(category: query.category == c.slug ? '' : c.slug))),
                ],
              ],
            ),
          ),
        ],
      ],
    );

    return PagedList<RecyclingCenter>(
      provider: centersProvider,
      header: header,
      itemBuilder: (context, item) => CenterCard(center: item, onTap: () => context.push(Routes.center(item.id, listing: widget.listingId))),
      emptyTitle: 'No recycling centres found',
      emptyMessage: 'Try a different search, or choose another kind of device.',
      emptyIcon: Icons.recycling_outlined,
      skeletonHeight: 130,
    );
  }
}

class CentersPage extends StatelessWidget {
  const CentersPage({super.key, this.listingId});

  final String? listingId;

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'Recycling centres'),
        body: AppBackground(child: SafeArea(child: CentersScreen(listingId: listingId))),
      );
}
