import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../models/donation.dart';
import '../../providers/donation_providers.dart';
import '../../providers/listings_controller.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/paged_list.dart';
import 'donation_card.dart';

/// The three lists: devices anyone can ask for, the ones the person offered, and the ones they asked for.
const donationScopes = [('', 'Available'), ('donor', 'My donations'), ('recipient', 'I asked for')];

/// The donation marketplace: search, a category, the device's condition, and a card for each donation.
class DonationsScreen extends ConsumerStatefulWidget {
  const DonationsScreen({super.key});

  @override
  ConsumerState<DonationsScreen> createState() => _DonationsScreenState();
}

class _DonationsScreenState extends ConsumerState<DonationsScreen> {
  final _search = TextEditingController();
  Timer? _debounce;

  @override
  void dispose() {
    _debounce?.cancel();
    _search.dispose();
    super.dispose();
  }

  void _setQuery(String text) => ref.read(donationQueryProvider.notifier).update((q) => q.copyWith(q: text));

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
    final query = ref.watch(donationQueryProvider);
    final notifier = ref.read(donationQueryProvider.notifier);
    final categories = ref.watch(categoriesProvider).valueOrNull ?? const [];

    final header = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        _row([for (final (value, label) in donationScopes) AppChip(label: label, selected: query.scope == value, onTap: () => notifier.update((q) => q.copyWith(scope: value)))]),
        const SizedBox(height: 12),
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
        if (categories.isNotEmpty) ...[
          const SizedBox(height: 12),
          _row([
            AppChip(label: 'All devices', selected: query.category.isEmpty, onTap: () => notifier.update((q) => q.copyWith(category: ''))),
            for (final c in categories)
              AppChip(label: c.name, selected: query.category == c.slug, onTap: () => notifier.update((q) => q.copyWith(category: query.category == c.slug ? '' : c.slug))),
          ]),
        ],
        const SizedBox(height: 4),
        Align(
          alignment: Alignment.centerLeft,
          child: TextButton.icon(onPressed: () => context.push(Routes.recipient), icon: const Icon(Icons.apartment_outlined), label: const Text('Register your organisation to ask for devices')),
        ),
        _row([
          AppChip(label: 'Any condition', selected: query.condition.isEmpty, onTap: () => notifier.update((q) => q.copyWith(condition: ''))),
          for (final (value, label) in conditions)
            if (value != 'for_spare_parts') AppChip(label: label, selected: query.condition == value, onTap: () => notifier.update((q) => q.copyWith(condition: query.condition == value ? '' : value))),
        ]),
      ],
    );

    return PagedList<Donation>(
      provider: donationsProvider,
      header: header,
      itemBuilder: (context, d) => DonationCard(donation: d, onTap: () => context.push(Routes.donation(d.id))),
      emptyTitle: query.scope == 'donor'
          ? 'You have not offered a device yet'
          : query.scope == 'recipient'
              ? 'You have not asked for a device yet'
              : 'No donations right now',
      emptyMessage: query.scope == 'donor'
          ? 'List a device, choose Donation as the service, then offer it from its page.'
          : query.scope == 'recipient'
              ? 'Verified organisations can ask for devices on the Available tab.'
              : 'Try a different search, or clear a filter. New devices are offered all the time.',
      emptyIcon: Icons.volunteer_activism_outlined,
      skeletonHeight: 110,
    );
  }
}

/// Full-screen page around [DonationsScreen]. [initialScope] opens it on one list.
class DonationsPage extends ConsumerStatefulWidget {
  const DonationsPage({super.key, this.initialScope = ''});

  final String initialScope;

  @override
  ConsumerState<DonationsPage> createState() => _DonationsPageState();
}

class _DonationsPageState extends ConsumerState<DonationsPage> {
  @override
  void initState() {
    super.initState();
    // Set once the tree has finished building: providers may not change while it is being built.
    Future.microtask(() {
      if (mounted) ref.read(donationQueryProvider.notifier).update((q) => q.copyWith(scope: widget.initialScope));
    });
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'Donations'),
        body: const AppBackground(child: SafeArea(child: DonationsScreen())),
      );
}
