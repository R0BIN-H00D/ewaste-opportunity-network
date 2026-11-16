import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
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

  Widget _row(List<Widget> chips) => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        child: Row(children: [for (var i = 0; i < chips.length; i++) ...[if (i > 0) const SizedBox(width: 8), chips[i]]]),
      );

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
        if (categories.isNotEmpty) ...[
          const SizedBox(height: 12),
          _row([
            AppChip(label: 'All devices', selected: query.category.isEmpty, onTap: () => notifier.update((q) => q.copyWith(category: ''))),
            for (final c in categories)
              AppChip(label: c.name, selected: query.category == c.slug, onTap: () => notifier.update((q) => q.copyWith(category: query.category == c.slug ? '' : c.slug))),
          ]),
        ],
        const SizedBox(height: 12),
        _row([
          AppChip(label: 'Any condition', selected: query.condition.isEmpty, onTap: () => notifier.update((q) => q.copyWith(condition: ''))),
          for (final (value, label) in conditions)
            AppChip(label: label, selected: query.condition == value, onTap: () => notifier.update((q) => q.copyWith(condition: query.condition == value ? '' : value))),
        ]),
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
        appBar: glassAppBar(context, 'Devices to refurbish'),
        body: const AppBackground(child: SafeArea(child: RefurbOpportunitiesScreen())),
      );
}
