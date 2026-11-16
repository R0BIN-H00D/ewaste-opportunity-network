import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/recycling.dart';
import '../../providers/recycling_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import 'center_card.dart';

/// One recycling centre: who they are, what they take, when they are open, and the button that sends devices to them.
class CenterDetailsScreen extends ConsumerWidget {
  const CenterDetailsScreen({super.key, required this.id, this.listingId});

  final String id;
  final String? listingId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final center = ref.watch(centerProvider(id));
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Recycling centre'),
      body: AppBackground(
        child: SafeArea(
          child: center.when(
            loading: () => ListView(padding: const EdgeInsets.all(20), children: const [Skeleton(height: 120, radius: 24), SizedBox(height: 16), Skeleton(height: 160, radius: 24)]),
            error: (e, _) => ListView(
              padding: const EdgeInsets.all(20),
              children: [
                ErrorState(
                  error: ApiException.from(e),
                  title: ApiException.from(e).failure == ApiFailure.notFound ? 'This centre is not available' : null,
                  onRetry: () => ref.invalidate(centerProvider(id)),
                ),
              ],
            ),
            data: (c) => _Body(center: c, listingId: listingId),
          ),
        ),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.center, this.listingId});

  final RecyclingCenter center;
  final String? listingId;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final c = center;
    Widget fact(IconData icon, String text) => Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [Icon(icon, size: 18), const SizedBox(width: 8), Expanded(child: Text(text, style: theme.textTheme.bodyLarge))]),
        );
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      children: [
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(header: true, child: Text(c.name, style: theme.textTheme.headlineSmall)),
              if (c.city != null && c.city!.trim().isNotEmpty) Text(c.city!, style: theme.textTheme.bodyMedium),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  if (c.authorized) const StatusBadge('Authorised', tone: BadgeTone.green),
                  StatusBadge(centerRatingText(c), tone: BadgeTone.neutral),
                ],
              ),
              if (c.operatingHours != null && c.operatingHours!.trim().isNotEmpty) fact(Icons.schedule_outlined, c.operatingHours!),
              if (c.authorizationNo != null && c.authorizationNo!.trim().isNotEmpty)
                fact(Icons.verified_outlined, 'Authorisation ${c.authorizationNo}${c.authorizingBody == null ? '' : ' from ${c.authorizingBody}'}${c.validUntil == null ? '' : ', valid until ${formatDate(c.validUntil)}'}'),
            ],
          ),
        ),
        const SizedBox(height: 16),
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Semantics(header: true, child: Text('What they accept', style: theme.textTheme.titleLarge)),
              const SizedBox(height: 8),
              if (c.acceptedCategories.isEmpty)
                Text('This centre has not listed the devices it accepts.', style: theme.textTheme.bodyMedium)
              else
                Wrap(spacing: 8, runSpacing: 8, children: [for (final cat in c.acceptedCategories) StatusBadge(cat.name, tone: BadgeTone.blue)]),
            ],
          ),
        ),
        if ((c.facilityDetails ?? '').trim().isNotEmpty || c.collectionAreas.isNotEmpty) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text('About the centre', style: theme.textTheme.titleLarge)),
                if ((c.facilityDetails ?? '').trim().isNotEmpty) ...[const SizedBox(height: 8), Text(c.facilityDetails!, style: theme.textTheme.bodyLarge)],
                if (c.collectionAreas.isNotEmpty) fact(Icons.local_shipping_outlined, 'Collects from ${c.collectionAreas.join(', ')}'),
              ],
            ),
          ),
        ],
        if (c.totalActualKg > 0) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Row(
              children: [
                Icon(Icons.scale_outlined, color: theme.colorScheme.primary),
                const SizedBox(width: 12),
                Expanded(child: Text('${formatKg(c.totalActualKg)} of materials recovered and weighed so far.', style: theme.textTheme.bodyLarge)),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        const MessageBanner(message: 'Only your area is shared when you send a request. The centre sees your exact address after they accept, and the app never handles money.'),
        const SizedBox(height: 16),
        Semantics(
          button: true,
          label: 'Send devices to ${c.name}',
          excludeSemantics: true,
          child: FilledButton.icon(
            onPressed: () => context.push(Routes.recycle(center: c.id, listing: listingId)),
            icon: const Icon(Icons.recycling_outlined),
            label: const Text('Send devices here'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
          ),
        ),
      ],
    );
  }
}
