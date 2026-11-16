import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../core/recycling_validation.dart';
import '../../providers/listings_controller.dart';
import '../../providers/recycling_providers.dart';
import '../../providers/technicians_controller.dart';
import '../../routes/route_paths.dart';
import '../../services/photo_picker.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/app_text_field.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/loading_button.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/photo_attachments.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';

const maxRecyclingPhotos = 6;

/// Send devices to a recycling centre: what, how many, where from, when, and photos. The exact address stays private until the centre accepts (BR-08).
class RecycleScreen extends ConsumerStatefulWidget {
  const RecycleScreen({super.key, required this.centerId, this.listingId});

  final String centerId;
  final String? listingId;

  @override
  ConsumerState<RecycleScreen> createState() => _RecycleScreenState();
}

class _RecycleScreenState extends ConsumerState<RecycleScreen> {
  final _formKey = GlobalKey<FormState>();
  final _area = TextEditingController();
  final _address = TextEditingController();
  final _notes = TextEditingController();
  final _selected = <String>{};
  int _count = 1;
  DateTime? _date;
  List<PickedPhoto> _photos = const [];
  bool _sending = false;
  String? _banner;
  String? _categoryError;
  Map<String, String> _serverErrors = const {};

  @override
  void dispose() {
    _area.dispose();
    _address.dispose();
    _notes.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? now.add(const Duration(days: 2)),
      firstDate: now.add(const Duration(days: 1)),
      lastDate: now.add(const Duration(days: 90)),
      helpText: 'When would suit you?',
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _send() async {
    setState(() {
      _banner = null;
      _serverErrors = const {};
      _categoryError = _selected.isEmpty ? 'Choose at least one kind of device' : null;
    });
    final valid = _formKey.currentState!.validate();
    if (!valid || _selected.isEmpty) return;
    setState(() => _sending = true);
    try {
      final request = await ref.read(recyclingRepositoryProvider).create(
            centerId: widget.centerId,
            categoryIds: _selected.toList(),
            deviceCount: _count,
            area: _area.text,
            address: _address.text,
            preferredDate: _date,
            notes: _notes.text,
            listingId: widget.listingId,
            photos: _photos,
          );
      ref.invalidate(recyclingRequestsProvider);
      final listing = widget.listingId;
      if (listing != null) {
        // The device is now held for this request, so lists that showed it as "Listed" are out of date.
        ref.invalidate(listingProvider(listing));
        ref.invalidate(listingsProvider(true));
        ref.invalidate(listingsProvider(false));
        ref.invalidate(repairableListingsProvider);
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Request sent')));
      context.pushReplacement(Routes.recyclingRequest(request.id));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _sending = false;
        _serverErrors = e.fieldErrors;
        _categoryError = e.fieldErrors['categories'] ?? _categoryError;
        _banner = e.fieldErrors.isEmpty ? e.message : 'Please fix the highlighted fields.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final center = ref.watch(centerProvider(widget.centerId));
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Send devices to recycle'),
      body: AppBackground(
        child: SafeArea(
          child: center.when(
            loading: () => ListView(padding: const EdgeInsets.all(20), children: const [Skeleton(height: 90, radius: 24), SizedBox(height: 16), Skeleton(height: 200, radius: 24)]),
            error: (e, _) => ListView(padding: const EdgeInsets.all(20), children: [ErrorState(error: ApiException.from(e), onRetry: () => ref.invalidate(centerProvider(widget.centerId)))]),
            data: (c) => Form(
              key: _formKey,
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
                children: [
                  GlassContainer(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      children: [
                        Icon(Icons.recycling_outlined, color: theme.colorScheme.primary),
                        const SizedBox(width: 12),
                        Expanded(child: Text(c.name, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16))),
                      ],
                    ),
                  ),
                  if (widget.listingId != null) ...[const SizedBox(height: 12), _ListingNote(id: widget.listingId!)],
                  const SizedBox(height: 20),
                  Semantics(header: true, child: Text('What are you sending?', style: theme.textTheme.titleLarge)),
                  const SizedBox(height: 8),
                  if (c.acceptedCategories.isEmpty)
                    const MessageBanner(message: 'This centre has not listed what it accepts, so it cannot take a request yet.', tone: BannerTone.warning)
                  else
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final cat in c.acceptedCategories)
                          AppChip(
                            label: cat.name,
                            selected: _selected.contains(cat.id),
                            onTap: _sending ? () {} : () => setState(() => _selected.contains(cat.id) ? _selected.remove(cat.id) : _selected.add(cat.id)),
                          ),
                      ],
                    ),
                  // Always one child here, so the fields below keep their state (and their messages) when this one appears.
                  Padding(
                    padding: EdgeInsets.only(top: _categoryError == null ? 0 : 6),
                    child: _categoryError == null ? const SizedBox.shrink() : Text(_categoryError!, style: TextStyle(color: theme.colorScheme.error)),
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(child: Text('How many devices?', style: theme.textTheme.titleSmall)),
                      IconButton(
                        tooltip: 'One fewer',
                        constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                        icon: const Icon(Icons.remove_circle_outline),
                        onPressed: _sending || _count <= 1 ? null : () => setState(() => _count--),
                      ),
                      Semantics(liveRegion: true, label: '$_count devices', child: ExcludeSemantics(child: Text('$_count', style: theme.textTheme.titleLarge))),
                      IconButton(
                        tooltip: 'One more',
                        constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
                        icon: const Icon(Icons.add_circle_outline),
                        onPressed: _sending || _count >= maxRecyclingDevices ? null : () => setState(() => _count++),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Semantics(header: true, child: Text('Where should they collect from?', style: theme.textTheme.titleLarge)),
                  const SizedBox(height: 8),
                  AppTextField(controller: _area, label: 'Area or locality', icon: Icons.place_outlined, validator: validatePickupArea, serverError: _serverErrors['pickupAddressArea']),
                  const SizedBox(height: 12),
                  AppTextField(
                    controller: _address,
                    label: 'Full pickup address',
                    icon: Icons.home_outlined,
                    maxLines: 3,
                    keyboardType: TextInputType.multiline,
                    validator: validatePickupAddress,
                    serverError: _serverErrors['pickupAddress'],
                  ),
                  const SizedBox(height: 4),
                  Text('The centre only sees the area until they accept.', style: theme.textTheme.bodyMedium),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: OutlinedButton.icon(
                          onPressed: _sending ? null : _pickDate,
                          icon: const Icon(Icons.event_outlined),
                          label: Text(_date == null ? 'Preferred date (optional)' : 'Preferred: ${formatDate(_date)}'),
                          style: OutlinedButton.styleFrom(minimumSize: const Size(48, 48)),
                        ),
                      ),
                      if (_date != null) IconButton(tooltip: 'Clear the date', constraints: const BoxConstraints(minWidth: 48, minHeight: 48), icon: const Icon(Icons.close), onPressed: () => setState(() => _date = null)),
                    ],
                  ),
                  Padding(
                    padding: EdgeInsets.only(top: _serverErrors['preferredDate'] == null ? 0 : 6),
                    child: _serverErrors['preferredDate'] == null ? const SizedBox.shrink() : Text(_serverErrors['preferredDate']!, style: TextStyle(color: theme.colorScheme.error)),
                  ),
                  const SizedBox(height: 12),
                  AppTextField(
                    controller: _notes,
                    label: 'Notes for the centre (optional)',
                    icon: Icons.notes_outlined,
                    maxLines: 3,
                    keyboardType: TextInputType.multiline,
                    validator: validateRecyclingNotes,
                    serverError: _serverErrors['notes'],
                  ),
                  const SizedBox(height: 16),
                  PhotoAttachments(photos: _photos, max: maxRecyclingPhotos, label: 'Photos (optional)', onChanged: (p) => setState(() => _photos = p)),
                  if (_banner != null) ...[const SizedBox(height: 12), MessageBanner(message: _banner!, tone: BannerTone.error)],
                  const SizedBox(height: 16),
                  LoadingButton(label: 'Send request', icon: Icons.send_outlined, loading: _sending, onPressed: c.acceptedCategories.isEmpty ? null : _send),
                  const SizedBox(height: 12),
                  const MessageBanner(message: 'Back up and reset your devices first. You will be reminded before the handover.'),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ListingNote extends ConsumerWidget {
  const _ListingNote({required this.id});

  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final listing = ref.watch(listingProvider(id));
    return listing.when(
      loading: () => const Skeleton(height: 40, radius: 16),
      error: (_, __) => const SizedBox.shrink(),
      data: (l) => MessageBanner(message: '"${l.title}" from your listings will be held for this request and listed again if it is declined or cancelled.'),
    );
  }
}
