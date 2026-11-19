import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/listing.dart';
import '../../models/refurbishment.dart';
import '../../providers/listings_controller.dart';
import '../../providers/refurbishment_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/paged_list.dart';
import 'refurb_dialogs.dart';
import 'refurb_opportunity_card.dart';

/// Devices owners would like refurbished. Tapping one opens the offer form; sending it opens the new job.
class RefurbOpportunitiesScreen extends ConsumerStatefulWidget {
  const RefurbOpportunitiesScreen({super.key});

  @override
  ConsumerState<RefurbOpportunitiesScreen> createState() => _RefurbOpportunitiesScreenState();
}

class _RefurbOpportunitiesScreenState extends ConsumerState<RefurbOpportunitiesScreen> {
  final _search = TextEditingController();
  Timer? _debounce;
  String? _error;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _setQuery(String text) => ref.read(refurbOpportunityQueryProvider.notifier).update((q) => q.copyWith(q: text));

  void _onChanged(String text) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => _setQuery(text));
  }

  Future<void> _openFilters(List<Category> categories) async {
    FocusScope.of(context).unfocus();
    final current = ref.read(refurbOpportunityQueryProvider);
    var category = current.category;
    var condition = current.condition;
    final filters = await showModalBottomSheet<({String category, String condition})>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      builder: (sheetContext) => StatefulBuilder(
        builder: (context, setSheetState) {
          final textTheme = Theme.of(context).textTheme;
          return SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      Expanded(child: Text('Filter requests', style: textTheme.titleLarge)),
                      TextButton(
                        onPressed: category.isEmpty && condition.isEmpty ? null : () => setSheetState(() {
                          category = '';
                          condition = '';
                        }),
                        child: const Text('Reset'),
                      ),
                    ],
                  ),
                  if (categories.isNotEmpty) ...[
                    const SizedBox(height: 16),
                    Text('Device category', style: textTheme.titleSmall),
                    const SizedBox(height: 8),
                    Wrap(spacing: 8, runSpacing: 8, children: [
                      AppChip(label: 'All devices', selected: category.isEmpty, onTap: () => setSheetState(() => category = '')),
                      for (final c in categories)
                        AppChip(label: c.name, selected: category == c.slug, onTap: () => setSheetState(() => category = c.slug)),
                    ]),
                  ],
                  const SizedBox(height: 16),
                  Text('Condition', style: textTheme.titleSmall),
                  const SizedBox(height: 8),
                  Wrap(spacing: 8, runSpacing: 8, children: [
                    AppChip(label: 'Any condition', selected: condition.isEmpty, onTap: () => setSheetState(() => condition = '')),
                    for (final (value, label) in conditions)
                      AppChip(label: label, selected: condition == value, onTap: () => setSheetState(() => condition = value)),
                  ]),
                  const SizedBox(height: 24),
                  FilledButton(
                    onPressed: () => Navigator.of(sheetContext).pop((category: category, condition: condition)),
                    child: const Text('Show results'),
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
    if (!mounted || filters == null) return;
    if (filters.category == current.category && filters.condition == current.condition) return;
    ref.read(refurbOpportunityQueryProvider.notifier).update((q) => q.copyWith(category: filters.category, condition: filters.condition));
  }

  Future<void> _offer(RefurbOpportunity o) async {
    if (o.hasOffered) {
      setState(() => _error = 'You already made an offer on this device. Open it from your jobs.');
      return;
    }
    final input = await askOffer(context, title: o.device.title);
    if (input == null || !mounted) return;
    setState(() => _error = null);
    try {
      final job = await ref.read(refurbishmentRepositoryProvider).makeOffer(listingId: o.id, amount: input.amount, message: input.message);
      ref.invalidate(refurbOpportunitiesProvider);
      ref.invalidate(refurbJobsProvider);
      if (mounted) context.push(Routes.refurbJob(job.id));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message);
      if (e.code == 'ALREADY_OFFERED' || e.code == 'LISTING_UNAVAILABLE') ref.invalidate(refurbOpportunitiesProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(refurbOpportunityQueryProvider);
    final notifier = ref.read(refurbOpportunityQueryProvider.notifier);
    final categories = ref.watch(categoriesProvider).valueOrNull ?? const [];
    final filterCount = query.activeFilters;
    final categoryName = categories.where((c) => c.slug == query.category).firstOrNull?.name ?? query.category;

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
            labelText: 'Search by name, brand or model',
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
        if (_error != null) ...[const SizedBox(height: 12), MessageBanner(message: _error!, tone: BannerTone.error)],
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            FilledButton.tonalIcon(
              onPressed: () => _openFilters(categories),
              icon: const Icon(Icons.tune_rounded),
              label: Text(filterCount == 0 ? 'Filters' : 'Filters ($filterCount)'),
            ),
            if (query.category.isNotEmpty)
              InputChip(
                label: Text(categoryName),
                deleteButtonTooltipMessage: 'Remove device category filter',
                onDeleted: () => notifier.update((q) => q.copyWith(category: '')),
              ),
            if (query.condition.isNotEmpty)
              InputChip(
                label: Text(labelOf(conditions, query.condition)),
                deleteButtonTooltipMessage: 'Remove condition filter',
                onDeleted: () => notifier.update((q) => q.copyWith(condition: '')),
              ),
          ],
        ),
      ],
    );

    return PagedList<RefurbOpportunity>(
      provider: refurbOpportunitiesProvider,
      header: header,
      itemBuilder: (context, o) => RefurbOpportunityCard(opportunity: o, onTap: () => _offer(o)),
      emptyTitle: 'No devices to refurbish right now',
      emptyMessage: 'Owners choose refurbishment when they list a device. Try a different search, or check back later.',
      emptyIcon: Icons.build_circle_outlined,
      skeletonHeight: 110,
    );
  }
}

class RefurbOpportunitiesPage extends StatelessWidget {
  const RefurbOpportunitiesPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: AppBar(
          title: const Text('Requests'),
          backgroundColor: Colors.transparent,
          elevation: 0,
          actions: [
            TextButton.icon(
              onPressed: () => context.push(Routes.wanted),
              icon: const Icon(Icons.add),
              label: const Text('New request'),
            ),
          ],
        ),
        body: const AppBackground(child: SafeArea(child: RefurbOpportunitiesScreen())),
      );
}
