import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/condition_parts.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/listing.dart';
import '../../providers/listings_controller.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/ai_cards.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/message_button.dart';
import '../../widgets/listing_photo.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import 'listing_card.dart';

/// One listing in full: photos, facts, what the owner wants, and (for the owner) status and removal.
class DeviceDetailsScreen extends ConsumerWidget {
  const DeviceDetailsScreen({super.key, required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listing = ref.watch(listingProvider(id));
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Device'),
      body: AppBackground(
        child: SafeArea(
          child: listing.when(
            loading: () => ListView(
              padding: const EdgeInsets.all(20),
              children: const [Skeleton(height: 240, radius: 24), SizedBox(height: 16), Skeleton(height: 28, width: 220), SizedBox(height: 12), Skeleton(height: 100, radius: 24)],
            ),
            error: (e, _) => ListView(
              padding: const EdgeInsets.all(20),
              children: [
                ErrorState(
                  error: e is ApiException ? e : ApiException.from(e),
                  title: e is ApiException && e.statusCode == 404 ? 'This listing is not available' : null,
                  onRetry: () => ref.invalidate(listingProvider(id)),
                ),
              ],
            ),
            data: (l) => _Body(listing: l),
          ),
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.listing});

  final Listing listing;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  bool _removing = false;
  String? _error;

  Future<void> _remove() async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Remove this listing?'),
        content: const Text('It will disappear from Browse. This cannot be undone.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Keep it')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Remove')),
        ],
      ),
    );
    if (yes != true || !mounted) return;
    setState(() {
      _removing = true;
      _error = null;
    });
    try {
      await ref.read(deviceRepositoryProvider).remove(widget.listing.id);
      if (!mounted) return;
      await ref.read(listingsProvider(true).notifier).load();
      await ref.read(listingsProvider(false).notifier).load();
      if (mounted) context.pop();
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _removing = false;
          _error = e.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = widget.listing;
    final theme = Theme.of(context);
    final facts = <(String, String)>[
      ('Condition', labelOf(conditions, l.condition)),
      ...conditionRows(l.conditionDetails),
      ('Wanted', labelOf(services, l.preferredService)),
      if (l.pickupPreference != null) ('Handover', labelOf(pickups, l.pickupPreference)),
      if (l.categoryName != null) ('Category', l.categoryName!),
      if (l.brand != null && l.brand!.isNotEmpty) ('Brand', l.brand!),
      if (l.model != null && l.model!.isNotEmpty) ('Model', l.model!),
      if (l.modelYear != null) ('Model year', '${l.modelYear}'),
      if (l.purchaseYear != null) ('Bought', '${l.purchaseYear}'),
      if (l.ageYears != null) ('Age', l.ageYears == 1 ? '1 year' : '${l.ageYears} years'),
      if (l.place.isNotEmpty) ('Area', l.place),
      if (l.ownerName != null && !l.isOwner) ('Listed by', l.ownerName!),
    ];

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: [
        _Gallery(photos: l.photos, title: l.title),
        const SizedBox(height: 16),
        Semantics(header: true, child: Text(l.title, style: theme.textTheme.headlineMedium)),
        const SizedBox(height: 8),
        Wrap(
          spacing: 6,
          runSpacing: 6,
          children: [
            StatusBadge(labelOf(services, l.preferredService), tone: BadgeTone.blue),
            StatusBadge(labelOf(conditions, l.condition), tone: conditionTone(l.condition)),
            if (!l.isLive) StatusBadge(listingStatusLabels[l.status] ?? l.status),
          ],
        ),
        const SizedBox(height: 12),
        Text(formatPrice(l.expectedPrice), style: theme.textTheme.headlineMedium?.copyWith(color: theme.colorScheme.primary)),
        if (l.isOwner && l.status == 'removed_by_admin') ...[
          const SizedBox(height: 12),
          MessageBanner(
            tone: BannerTone.warning,
            message: l.moderationReason == null || l.moderationReason!.isEmpty
                ? 'An administrator removed this listing.'
                : 'An administrator removed this listing: ${l.moderationReason}',
          ),
        ],
        const SizedBox(height: 16),
        GlassContainer(
          child: Column(
            children: [
              for (var i = 0; i < facts.length; i++) ...[
                if (i > 0) Divider(height: 16, color: theme.colorScheme.outline.withValues(alpha: 0.4)),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(width: 96, child: Text(facts[i].$1, style: theme.textTheme.bodyMedium)),
                    Expanded(child: Text(facts[i].$2, style: theme.textTheme.titleLarge?.copyWith(fontSize: 15))),
                  ],
                ),
              ],
            ],
          ),
        ),
        if (l.description != null && l.description!.trim().isNotEmpty) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text('About this device', style: theme.textTheme.titleLarge)),
                const SizedBox(height: 8),
                Text(l.description!, style: theme.textTheme.bodyLarge),
              ],
            ),
          ),
        ],
        const SizedBox(height: 16),
        // BR-08: only the area is ever shown; the street address is shared privately once both sides agree.
        const MessageBanner(
          tone: BannerTone.info,
          message: 'Only the area is shown. The exact address is shared privately when both sides agree to a handover.',
        ),
        if (!l.isOwner && l.isLive) ...[
          const SizedBox(height: 16),
          MessageButton(contextType: 'enquiry', contextId: l.id, label: 'Ask ${l.ownerName ?? 'the owner'} a question'),
        ],
        if (l.isOwner && l.isLive) ...[
          const SizedBox(height: 16),
          SmartMatchesCard(listingId: l.id, service: l.preferredService),
        ],
        if (l.isOwner) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text('Your listing', style: theme.textTheme.titleLarge)),
                const SizedBox(height: 8),
                Text('Status: ${listingStatusLabels[l.status] ?? l.status}', style: theme.textTheme.bodyLarge),
                if (l.viewCount != null) Text('Seen ${l.viewCount} ${l.viewCount == 1 ? 'time' : 'times'}', style: theme.textTheme.bodyMedium),
                if (_error != null) ...[const SizedBox(height: 12), MessageBanner(message: _error!, tone: BannerTone.error)],
                if (l.isLive && l.preferredService == 'repair') ...[
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: () => context.push(Routes.techniciansFor(listing: l.id)),
                    icon: const Icon(Icons.handyman_outlined),
                    label: const Text('Find a technician'),
                  ),
                ],
                if (l.isLive && l.preferredService == 'recycling') ...[
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: () => context.push(Routes.centersFor(listing: l.id)),
                    icon: const Icon(Icons.recycling_outlined),
                    label: const Text('Send to a recycling centre'),
                  ),
                ],
                if (l.isLive && l.preferredService == 'donation' && l.condition != 'for_spare_parts') ...[
                  const SizedBox(height: 12),
                  FilledButton.icon(
                    onPressed: () => context.push(Routes.offerDonation(l.id)),
                    icon: const Icon(Icons.volunteer_activism_outlined),
                    label: const Text('Offer as a donation'),
                  ),
                ],
                if (l.status == 'in_service') ...[
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    onPressed: () => context.push(
                      l.preferredService == 'recycling'
                          ? Routes.recyclingRequests
                          : l.preferredService == 'donation'
                              ? Routes.donationsWith('donor')
                              : Routes.requests,
                    ),
                    icon: Icon(l.preferredService == 'recycling'
                        ? Icons.recycling_outlined
                        : l.preferredService == 'donation'
                            ? Icons.volunteer_activism_outlined
                            : Icons.build_circle_outlined),
                    label: Text(l.preferredService == 'recycling'
                        ? 'See the recycling request'
                        : l.preferredService == 'donation'
                            ? 'See the donation'
                            : 'See the repair request'),
                  ),
                ],
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: _removing ? null : _remove,
                  icon: _removing
                      ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.delete_outline),
                  label: Text(_removing ? 'Removing…' : 'Remove listing'),
                ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// Swipeable photos with a "2 of 5" label that screen readers can follow, or a placeholder when there are none.
class _Gallery extends StatefulWidget {
  const _Gallery({required this.photos, required this.title});

  final List<ListingPhoto> photos;
  final String title;

  @override
  State<_Gallery> createState() => _GalleryState();
}

class _GalleryState extends State<_Gallery> {
  final _controller = PageController();
  int _index = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final photos = widget.photos;
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: SizedBox(
        height: 240,
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (photos.isEmpty)
              const ListingPhotoView(photo: null)
            else
              PageView.builder(
                controller: _controller,
                itemCount: photos.length,
                onPageChanged: (i) => setState(() => _index = i),
                itemBuilder: (_, i) => ListingPhotoView(photo: photos[i], semanticLabel: '${widget.title}, photo ${i + 1} of ${photos.length}'),
              ),
            if (photos.length > 1)
              Positioned(
                right: 12,
                bottom: 12,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.6), borderRadius: BorderRadius.circular(12)),
                  child: Text('${_index + 1} of ${photos.length}', style: const TextStyle(color: Colors.white, fontSize: 12)),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
