import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/donation_validation.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../providers/donation_providers.dart';
import '../../providers/listings_controller.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/loading_button.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import '../devices/listing_card.dart' show conditionTone;

/// Offer one of the person's own devices for free. The device must be set to "Donation" and be working or repairable.
class OfferDonationScreen extends ConsumerStatefulWidget {
  const OfferDonationScreen({super.key, required this.listingId});

  final String listingId;

  @override
  ConsumerState<OfferDonationScreen> createState() => _OfferDonationScreenState();
}

class _OfferDonationScreenState extends ConsumerState<OfferDonationScreen> {
  final _formKey = GlobalKey<FormState>();
  final _note = TextEditingController();
  bool _sending = false;
  String? _banner;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _sending = true;
      _banner = null;
    });
    try {
      final donation = await ref.read(donationRepositoryProvider).offer(listingId: widget.listingId, description: _note.text);
      ref.invalidate(donationsProvider);
      ref.invalidate(listingsProvider(true));
      ref.invalidate(listingsProvider(false));
      ref.invalidate(listingProvider(widget.listingId));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Your device is now on offer')));
      context.pushReplacement(Routes.donation(donation.id));
    } on ApiException catch (e) {
      if (mounted) setState(() => _banner = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final listing = ref.watch(listingProvider(widget.listingId));
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Donate a device'),
      body: AppBackground(
        child: SafeArea(
          child: listing.when(
            loading: () => ListView(padding: const EdgeInsets.all(20), children: const [Skeleton(height: 120, radius: 24), SizedBox(height: 16), Skeleton(height: 160, radius: 24)]),
            error: (e, _) => ListView(padding: const EdgeInsets.all(20), children: [ErrorState(error: ApiException.from(e), onRetry: () => ref.invalidate(listingProvider(widget.listingId)))]),
            data: (l) {
              String? problem;
              if (!l.isOwner) {
                problem = 'You can only donate your own devices.';
              } else if (l.preferredService != 'donation') {
                problem = 'Set the service for this device to Donation first, then come back.';
              } else if (l.condition == 'for_spare_parts') {
                problem = 'Only working or repairable devices can be donated. Choose recycling for spare parts.';
              } else if (!l.isLive) {
                problem = 'This device already has an active service or is not published.';
              }
              return ListView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
                children: [
                  GlassContainer(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Semantics(header: true, child: Text(l.title, style: theme.textTheme.titleLarge)),
                        if (l.subtitle.isNotEmpty) Text(l.subtitle, style: theme.textTheme.bodyMedium),
                        const SizedBox(height: 8),
                        StatusBadge(labelOf(conditions, l.condition), tone: conditionTone(l.condition)),
                        if (l.place.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Shown as ${l.place}. Your exact address stays private.', style: theme.textTheme.bodyMedium)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  if (problem != null)
                    MessageBanner(message: problem, tone: BannerTone.warning)
                  else
                    GlassContainer(
                      child: Form(
                        key: _formKey,
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Verified organisations such as schools, colleges and NGOs can ask for it. You choose who receives it. Nobody pays.', style: theme.textTheme.bodyLarge),
                            const SizedBox(height: 12),
                            TextFormField(
                              controller: _note,
                              validator: validateDonationNote,
                              maxLines: 4,
                              maxLength: 1000,
                              decoration: const InputDecoration(labelText: 'A note for recipients (optional)'),
                            ),
                            const SizedBox(height: 8),
                            Text('Back up your data and sign out of your accounts before you hand the device over.', style: theme.textTheme.bodyMedium),
                            if (_banner != null) ...[const SizedBox(height: 12), MessageBanner(message: _banner!, tone: BannerTone.error)],
                            const SizedBox(height: 16),
                            LoadingButton(label: 'Offer this device', icon: Icons.volunteer_activism_outlined, loading: _sending, onPressed: _sending ? null : _send),
                          ],
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}
