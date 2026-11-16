import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/learning.dart';
import '../../providers/learning_providers.dart';
import '../../providers/listings_controller.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/paged_list.dart';
import 'opportunity_card.dart';

/// Supervised learning tasks: search, difficulty and the kind of device, and a card for each task.
class OpportunitiesScreen extends ConsumerStatefulWidget {
  const OpportunitiesScreen({super.key});

  @override
  ConsumerState<OpportunitiesScreen> createState() => _OpportunitiesScreenState();
}

class _OpportunitiesScreenState extends ConsumerState<OpportunitiesScreen> {
  final _search = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _setQuery(String text) => ref.read(opportunityQueryProvider.notifier).update((q) => q.copyWith(q: text));

  void _onChanged(String text) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => _setQuery(text));
  }

  Widget _row(List<Widget> chips) => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [for (var i = 0; i < chips.length; i++) ...[if (i > 0) const SizedBox(width: 8), chips[i]]]),
      );

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(opportunityQueryProvider);
    final notifier = ref.read(opportunityQueryProvider.notifier);
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
            labelText: 'Search tasks',
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
        const SizedBox(height: 12),
        _row([
          AppChip(label: 'Any level', selected: query.difficulty.isEmpty, onTap: () => notifier.update((q) => q.copyWith(difficulty: ''))),
          for (final (value, label) in difficulties)
            AppChip(label: label, selected: query.difficulty == value, onTap: () => notifier.update((q) => q.copyWith(difficulty: query.difficulty == value ? '' : value))),
        ]),
        if (categories.isNotEmpty) ...[
          const SizedBox(height: 8),
          _row([
            AppChip(label: 'All devices', selected: query.category.isEmpty, onTap: () => notifier.update((q) => q.copyWith(category: ''))),
            for (final c in categories)
              AppChip(label: c.name, selected: query.category == c.slug, onTap: () => notifier.update((q) => q.copyWith(category: query.category == c.slug ? '' : c.slug))),
          ]),
        ],
      ],
    );

    return PagedList<Opportunity>(
      provider: opportunitiesProvider,
      header: header,
      itemBuilder: (context, o) => OpportunityCard(opportunity: o, onTap: () => context.push(Routes.opportunity(o.id))),
      emptyTitle: 'No tasks open right now',
      emptyMessage: 'Technicians post new supervised tasks all the time. Try a different search, or check back soon.',
      emptyIcon: Icons.school_outlined,
      skeletonHeight: 110,
    );
  }
}

class OpportunitiesPage extends StatelessWidget {
  const OpportunitiesPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'Learning tasks'),
        body: const AppBackground(child: SafeArea(child: OpportunitiesScreen())),
      );
}
