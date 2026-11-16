import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/request_validation.dart';
import '../../models/listing.dart';
import '../../providers/listings_controller.dart';
import '../../providers/technicians_controller.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/app_text_field.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/listing_photo.dart';
import '../../widgets/loading_button.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';

/// Ask for a repair: pick the device, say what is wrong, and send it to one technician or post it for any suitable one.
class RequestRepairScreen extends ConsumerStatefulWidget {
  const RequestRepairScreen({super.key, this.listingId, this.technicianId});

  final String? listingId;
  final String? technicianId;

  @override
  ConsumerState<RequestRepairScreen> createState() => _RequestRepairScreenState();
}

class _RequestRepairScreenState extends ConsumerState<RequestRepairScreen> {
  final _formKey = GlobalKey<FormState>();
  final _issue = TextEditingController();
  String? _listingId;
  bool _onSite = false;
  bool _sending = false;
  String? _banner;
  String? _listingError;
  Map<String, String> _serverErrors = const {};

  @override
  void initState() {
    super.initState();
    _listingId = widget.listingId;
  }

  @override
  void dispose() {
    _issue.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() {
      _banner = null;
      _serverErrors = const {};
      _listingError = _listingId == null ? 'Choose the device to repair' : null;
    });
    final valid = _formKey.currentState!.validate();
    if (!valid || _listingId == null) return;
    setState(() => _sending = true);
    try {
      final request = await ref.read(requestRepositoryProvider).create(
            listingId: _listingId!,
            issue: _issue.text,
            technicianId: widget.technicianId,
            onSite: _onSite,
          );
      // The device is now locked to this request, so lists that showed it as "Listed" are out of date.
      ref.invalidate(requestsProvider);
      ref.invalidate(repairableListingsProvider);
      ref.invalidate(listingProvider(_listingId!));
      ref.invalidate(listingsProvider(true));
      ref.invalidate(listingsProvider(false));
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(widget.technicianId == null ? 'Request posted' : 'Request sent')));
      context.pushReplacement(Routes.request(request.id));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _serverErrors = e.fieldErrors;
        _banner = e.fieldErrors.isEmpty ? e.message : (e.fieldErrors['technicianId'] ?? 'Please fix the highlighted fields.');
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final fixedListing = widget.listingId != null;
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Ask for a repair'),
      body: AppBackground(
        child: SafeArea(
          child: Form(
            key: _formKey,
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
              children: [
                Semantics(header: true, child: Text('Which device?', style: theme.textTheme.titleLarge)),
                const SizedBox(height: 8),
                if (fixedListing) _ChosenListing(id: widget.listingId!) else _ListingPicker(selected: _listingId, error: _listingError, onPick: (id) => setState(() => _listingId = id)),
                const SizedBox(height: 20),
                Semantics(header: true, child: Text('Who should look at it?', style: theme.textTheme.titleLarge)),
                const SizedBox(height: 8),
                if (widget.technicianId != null)
                  _ChosenTechnician(id: widget.technicianId!)
                else
                  const MessageBanner(message: 'Open request: any suitable verified technician near you can take it. You will see who accepts.'),
                const SizedBox(height: 20),
                Semantics(header: true, child: Text('What is wrong?', style: theme.textTheme.titleLarge)),
                const SizedBox(height: 8),
                AppTextField(
                  controller: _issue,
                  label: 'Describe the problem',
                  icon: Icons.report_problem_outlined,
                  maxLines: 4,
                  keyboardType: TextInputType.multiline,
                  validator: validateIssue,
                  serverError: _serverErrors['issueDescription'],
                ),
                const SizedBox(height: 12),
                SwitchListTile(
                  contentPadding: EdgeInsets.zero,
                  title: const Text('Repair at my place'),
                  subtitle: const Text('The technician comes to you instead of collecting the device.'),
                  value: _onSite,
                  onChanged: _sending ? null : (v) => setState(() => _onSite = v),
                ),
                if (_banner != null) ...[const SizedBox(height: 8), MessageBanner(message: _banner!, tone: BannerTone.error)],
                const SizedBox(height: 16),
                LoadingButton(label: widget.technicianId == null ? 'Post request' : 'Send request', icon: Icons.send_outlined, loading: _sending, onPressed: _send),
                const SizedBox(height: 12),
                const MessageBanner(message: 'Only your area is shared at first. The technician sees your exact address after they accept, and nothing starts until you approve their quote.'),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ListingTile extends StatelessWidget {
  const _ListingTile({required this.listing, this.selected = false, this.onTap});

  final Listing listing;
  final bool selected;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      button: onTap != null,
      selected: selected,
      label: '${listing.title}. ${labelOf(conditions, listing.condition)}.',
      excludeSemantics: true,
      child: GlassContainer(
        padding: EdgeInsets.zero,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(24),
            onTap: onTap,
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(borderRadius: BorderRadius.circular(24), border: selected ? Border.all(color: theme.colorScheme.primary, width: 2) : null),
              child: Row(
                children: [
                  ClipRRect(borderRadius: BorderRadius.circular(14), child: SizedBox(width: 64, height: 64, child: ListingPhotoView(photo: listing.photos.isEmpty ? null : listing.photos.first))),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(listing.title, style: theme.textTheme.titleLarge?.copyWith(fontSize: 15), maxLines: 1, overflow: TextOverflow.ellipsis),
                        if (listing.subtitle.isNotEmpty) Text(listing.subtitle, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
                        Text(labelOf(conditions, listing.condition), style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12)),
                      ],
                    ),
                  ),
                  if (selected) Icon(Icons.check_circle, color: theme.colorScheme.primary),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ChosenListing extends ConsumerWidget {
  const _ChosenListing({required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listing = ref.watch(listingProvider(id));
    return listing.when(
      loading: () => const Skeleton(height: 84, radius: 24),
      error: (e, _) => ErrorState(error: e is ApiException ? e : ApiException.from(e), onRetry: () => ref.invalidate(listingProvider(id))),
      data: (l) => _ListingTile(listing: l, selected: true),
    );
  }
}

class _ListingPicker extends ConsumerWidget {
  const _ListingPicker({required this.selected, required this.error, required this.onPick});

  final String? selected;
  final String? error;
  final ValueChanged<String> onPick;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listings = ref.watch(repairableListingsProvider);
    return listings.when(
      loading: () => const Skeleton(height: 84, radius: 24),
      error: (e, _) => ErrorState(error: e is ApiException ? e : ApiException.from(e), onRetry: () => ref.invalidate(repairableListingsProvider)),
      data: (items) {
        if (items.isEmpty) {
          return EmptyState(
            icon: Icons.devices_other_outlined,
            title: 'No device ready for repair',
            message: 'List a device with "Repair" as what you want, then come back here.',
            actionLabel: 'List a device',
            onAction: () => context.push(Routes.newListing),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            for (final l in items) Padding(padding: const EdgeInsets.only(bottom: 8), child: _ListingTile(listing: l, selected: l.id == selected, onTap: () => onPick(l.id))),
            if (error != null) Padding(padding: const EdgeInsets.only(top: 4), child: Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error))),
          ],
        );
      },
    );
  }
}

class _ChosenTechnician extends ConsumerWidget {
  const _ChosenTechnician({required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tech = ref.watch(technicianProvider(id));
    final theme = Theme.of(context);
    return GlassContainer(
      padding: const EdgeInsets.all(14),
      child: tech.when(
        loading: () => const Skeleton(height: 24),
        error: (e, _) => Text('This technician could not be loaded. Go back and choose again.', style: theme.textTheme.bodyMedium),
        data: (t) => Row(
          children: [
            Icon(Icons.handyman_outlined, color: theme.colorScheme.primary),
            const SizedBox(width: 12),
            Expanded(child: Text(t.name, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16))),
            StatusBadge(labelOf(availabilities, t.availability), tone: t.availability == 'available' ? BadgeTone.green : BadgeTone.amber),
          ],
        ),
      ),
    );
  }
}
