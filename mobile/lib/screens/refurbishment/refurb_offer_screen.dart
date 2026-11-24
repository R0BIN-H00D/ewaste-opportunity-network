import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/refurbishment_validation.dart';
import '../../models/refurbishment.dart';
import '../../providers/refurbishment_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/listing_photo.dart';
import '../../widgets/message_banner.dart';
import '../devices/listing_card.dart' show conditionTone;

const _quickAmounts = [500, 1000, 2000, 5000];
const _messageIdeas = [
  'I can collect it this week.',
  'We refurbish and resell with a warranty.',
  'I can come to you with a pickup van.',
];
const _steps = [
  (Icons.send_outlined, 'You send the offer', 'The owner sees your price and message.'),
  (Icons.handshake_outlined, 'The owner chooses one', 'They pick a single refurbisher and tell you.'),
  (Icons.local_shipping_outlined, 'You arrange the pickup', 'Only then is the exact address shared with you.'),
];

/// Make an offer on one device, on a page of its own: the device first, then the amount and message, then what happens next.
class RefurbOfferScreen extends ConsumerStatefulWidget {
  const RefurbOfferScreen({super.key, required this.opportunity});

  final RefurbOpportunity opportunity;

  @override
  ConsumerState<RefurbOfferScreen> createState() => _RefurbOfferScreenState();
}

class _RefurbOfferScreenState extends ConsumerState<RefurbOfferScreen> {
  final _formKey = GlobalKey<FormState>();
  final _amount = TextEditingController();
  final _message = TextEditingController();
  bool _sending = false;
  String? _error;

  @override
  void dispose() {
    _amount.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final job = await ref.read(refurbishmentRepositoryProvider).makeOffer(
            listingId: widget.opportunity.id,
            amount: parseMoney(_amount.text),
            message: _message.text.trim(),
          );
      ref.invalidate(refurbOpportunitiesProvider);
      ref.invalidate(refurbJobsProvider);
      if (mounted) context.pushReplacement(Routes.refurbJob(job.id));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _error = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message);
      if (e.code == 'ALREADY_OFFERED' || e.code == 'LISTING_UNAVAILABLE') ref.invalidate(refurbOpportunitiesProvider);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final d = widget.opportunity.device;
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Make an offer'),
      body: AppBackground(
        child: SafeArea(
          child: Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 40),
              children: [
                Text('Make an offer', style: theme.textTheme.headlineSmall),
                const SizedBox(height: 4),
                Text('Tell the owner what you will pay and when you can collect. They choose one refurbisher.', style: theme.textTheme.bodyMedium),
                const SizedBox(height: 16),
                GlassContainer(
                  padding: EdgeInsets.zero,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      ClipRRect(
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
                        child: AspectRatio(aspectRatio: 4 / 3, child: ListingPhotoView(photo: d.photos.isEmpty ? null : d.photos.first)),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            StatusBadge(labelOf(conditions, d.condition), tone: conditionTone(d.condition)),
                            const SizedBox(height: 8),
                            Text(d.title, style: theme.textTheme.titleLarge),
                            if (d.subtitle.isNotEmpty) Text(d.subtitle, style: theme.textTheme.bodyMedium),
                            if (d.place.isNotEmpty) ...[
                              const SizedBox(height: 8),
                              Row(children: [
                                const Icon(Icons.place_outlined, size: 16),
                                const SizedBox(width: 6),
                                Expanded(child: Text(d.place, style: theme.textTheme.bodyMedium)),
                              ]),
                            ],
                            if ((d.description ?? '').trim().isNotEmpty) ...[
                              const SizedBox(height: 12),
                              Container(
                                width: double.infinity,
                                padding: const EdgeInsets.all(12),
                                decoration: BoxDecoration(color: theme.colorScheme.onSurface.withValues(alpha: 0.05), borderRadius: BorderRadius.circular(14)),
                                child: Text(d.description!.trim(), style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurface)),
                              ),
                            ],
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                GlassContainer(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('What will you pay the owner?', style: theme.textTheme.titleMedium),
                      const SizedBox(height: 4),
                      Text('Optional. Leave it empty to offer a free collection.', style: theme.textTheme.bodySmall),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _amount,
                        validator: validateOfferAmount,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        decoration: const InputDecoration(labelText: 'Amount you will pay the owner, in rupees (optional)', prefixIcon: Icon(Icons.currency_rupee)),
                      ),
                      const SizedBox(height: 10),
                      Wrap(spacing: 8, runSpacing: 8, children: [
                        AppChip(label: 'Free collection', selected: _amount.text.isEmpty, onTap: () => setState(_amount.clear)),
                        for (final a in _quickAmounts) AppChip(label: '₹$a', selected: _amount.text == '$a', onTap: () => setState(() => _amount.text = '$a')),
                      ]),
                      const SizedBox(height: 20),
                      Text('Add a message', style: theme.textTheme.titleMedium),
                      const SizedBox(height: 4),
                      Text('A short note helps the owner trust you. Tap an idea to start with it.', style: theme.textTheme.bodySmall),
                      const SizedBox(height: 10),
                      Wrap(spacing: 8, runSpacing: 8, children: [
                        for (final idea in _messageIdeas) AppChip(label: idea, selected: _message.text == idea, onTap: () => setState(() => _message.text = idea)),
                      ]),
                      const SizedBox(height: 12),
                      TextFormField(
                        controller: _message,
                        validator: validateOfferMessage,
                        maxLines: 3,
                        maxLength: 1000,
                        decoration: const InputDecoration(labelText: 'A message for the owner (optional)'),
                      ),
                      if (_error != null) ...[const SizedBox(height: 4), MessageBanner(message: _error!, tone: BannerTone.error)],
                      const SizedBox(height: 12),
                      FilledButton.icon(
                        onPressed: _sending ? null : _send,
                        style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                        icon: const Icon(Icons.send_outlined, size: 18),
                        label: Text(_sending ? 'Sending…' : 'Send offer'),
                      ),
                      const SizedBox(height: 10),
                      Text('Any payment is made directly between you and the owner. The app never handles money.', style: theme.textTheme.bodySmall),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                GlassContainer(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('What happens next', style: theme.textTheme.titleMedium),
                      const SizedBox(height: 12),
                      for (final (i, (icon, title, text)) in _steps.indexed)
                        Padding(
                          padding: EdgeInsets.only(bottom: i == _steps.length - 1 ? 0 : 14),
                          child: Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                width: 38,
                                height: 38,
                                decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                                child: Icon(icon, size: 20, color: theme.colorScheme.primary),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('${i + 1}. $title', style: theme.textTheme.titleSmall),
                                    Text(text, style: theme.textTheme.bodySmall),
                                  ],
                                ),
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
