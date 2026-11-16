import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/technician.dart';
import '../../providers/technicians_controller.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import 'technician_card.dart';

/// One technician in full, with the button that starts a request.
class TechnicianDetailsScreen extends ConsumerWidget {
  const TechnicianDetailsScreen({super.key, required this.id, this.listingId});

  final String id;
  final String? listingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final technician = ref.watch(technicianProvider(id));
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Technician'),
      body: AppBackground(
        child: SafeArea(
          child: technician.when(
            loading: () => ListView(
              padding: const EdgeInsets.all(20),
              children: const [Skeleton(height: 120, radius: 24), SizedBox(height: 16), Skeleton(height: 180, radius: 24)],
            ),
            error: (e, _) => ListView(
              padding: const EdgeInsets.all(20),
              children: [
                ErrorState(
                  error: e is ApiException ? e : ApiException.from(e),
                  title: e is ApiException && e.statusCode == 404 ? 'This technician is not available' : null,
                  onRetry: () => ref.invalidate(technicianProvider(id)),
                ),
              ],
            ),
            data: (t) => _Body(technician: t, listingId: listingId),
          ),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.technician, required this.listingId});

  final Technician technician;
  final String? listingId;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final t = technician;
    final facts = <(String, String)>[
      ('Rating', ratingText(t)),
      ('Jobs done', '${t.completedJobs}'),
      if (t.experienceYears != null) ('Experience', '${t.experienceYears} ${t.experienceYears == 1 ? 'year' : 'years'}'),
      if (t.place.isNotEmpty) ('Works in', t.place),
      if (t.serviceRadiusKm != null) ('Travels up to', '${t.serviceRadiusKm} km'),
      if (t.baseRate != null) ('Usual starting price', formatPrice(t.baseRate)),
    ];
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      children: [
        GlassContainer(
          child: Row(
            children: [
              TechnicianAvatar(name: t.name, size: 64),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Semantics(header: true, child: Text(t.name, style: theme.textTheme.headlineMedium?.copyWith(fontSize: 22))),
                    if (t.headline != null && t.headline!.trim().isNotEmpty) Text(t.headline!, style: theme.textTheme.bodyMedium),
                    const SizedBox(height: 8),
                    StatusBadge(labelOf(availabilities, t.availability), tone: availabilityTone(t.availability)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        GlassContainer(
          child: Column(
            children: [
              for (var i = 0; i < facts.length; i++) ...[
                if (i > 0) const Divider(height: 20),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: 140, child: Text(facts[i].$1, style: theme.textTheme.bodyMedium)),
                    Expanded(child: Text(facts[i].$2, style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600))),
                  ],
                ),
              ],
            ],
          ),
        ),
        if (t.specializations.isNotEmpty || t.categories.isNotEmpty || t.qualifications.isNotEmpty) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (t.specializations.isNotEmpty) ..._group(theme, 'Good at', t.specializations),
                if (t.categories.isNotEmpty) ..._group(theme, 'Repairs', t.categories),
                if (t.qualifications.isNotEmpty) ..._group(theme, 'Qualifications', t.qualifications),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        if (!t.isAvailable)
          const Padding(
            padding: EdgeInsets.only(bottom: 12),
            child: MessageBanner(message: 'This technician is not taking new jobs right now. You can post an open request instead.', tone: BannerTone.warning),
          ),
        FilledButton.icon(
          onPressed: t.isAvailable ? () => context.push(Routes.requestRepair(listing: listingId, technician: t.id)) : null,
          icon: const Icon(Icons.build_outlined),
          label: Text('Ask ${t.name.split(' ').first} to repair my device'),
        ),
        const SizedBox(height: 8),
        const MessageBanner(message: 'You pay the technician directly, after you have approved their quote. The app never handles money.'),
      ],
    );
  }

  List<Widget> _group(ThemeData theme, String title, List<String> values) => [
        Text(title, style: theme.textTheme.titleLarge?.copyWith(fontSize: 15)),
        const SizedBox(height: 6),
        Wrap(spacing: 6, runSpacing: 6, children: [for (final v in values) StatusBadge(v)]),
        const SizedBox(height: 12),
      ];
}
