import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../models/technician.dart';
import '../../providers/technicians_controller.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/paged_list.dart';
import 'technician_card.dart';

/// The directory of verified technicians: search, a few quick filters, and a card for each. [listingId] is the device
/// the person is trying to get repaired; it is passed on so the request form knows which one.
class TechniciansScreen extends ConsumerStatefulWidget {
  const TechniciansScreen({super.key, this.listingId});

  final String? listingId;

  @override
  ConsumerState<TechniciansScreen> createState() => _TechniciansScreenState();
}

class _TechniciansScreenState extends ConsumerState<TechniciansScreen> {
  final _search = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _setQuery(String text) => ref.read(technicianQueryProvider.notifier).update((q) => q.copyWith(q: text));

  void _onChanged(String text) {
    setState(() {});
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 400), () => _setQuery(text));
  }

  @override
  Widget build(BuildContext context) {
    final query = ref.watch(technicianQueryProvider);
    final notifier = ref.read(technicianQueryProvider.notifier);

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
            labelText: 'Search by name, skill or city',
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
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: Row(
            children: [
              AppChip(label: 'Available now', selected: query.availableOnly, onTap: () => notifier.update((q) => q.copyWith(availableOnly: !q.availableOnly))),
              const SizedBox(width: 8),
              AppChip(label: '4 stars and up', selected: query.minRating == 4, onTap: () => notifier.update((q) => q.copyWith(minRating: q.minRating == 4 ? 0 : 4))),
              const SizedBox(width: 8),
              AppChip(label: 'Most jobs done', selected: query.sort == 'experience', onTap: () => notifier.update((q) => q.copyWith(sort: q.sort == 'experience' ? 'rating' : 'experience'))),
            ],
          ),
        ),
        if (widget.listingId != null) ...[
          const SizedBox(height: 8),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              onPressed: () => context.push(Routes.requestRepair(listing: widget.listingId)),
              icon: const Icon(Icons.campaign_outlined),
              label: const Text('Or post an open request'),
            ),
          ),
        ],
      ],
    );

    return PagedList<Technician>(
      provider: techniciansProvider,
      header: header,
      itemBuilder: (context, item) => TechnicianCard(
        technician: item,
        onTap: () => context.push(Routes.technician(item.id, listing: widget.listingId)),
      ),
      emptyTitle: 'No technicians found',
      emptyMessage: 'Try a different search, or switch the filters off.',
      emptyIcon: Icons.handyman_outlined,
      skeletonHeight: 130,
    );
  }
}

/// Full-screen page around [TechniciansScreen].
class TechniciansPage extends StatelessWidget {
  const TechniciansPage({super.key, this.listingId});

  final String? listingId;

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'Find a technician'),
        body: AppBackground(child: SafeArea(child: TechniciansScreen(listingId: listingId))),
      );
}
