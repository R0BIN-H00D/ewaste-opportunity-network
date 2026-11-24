import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/network/api_exception.dart';
import '../../providers/location_providers.dart';
import '../../services/location_service.dart';
import '../../widgets/location_field.dart';
import '../../models/geo_place.dart';
import '../../models/account.dart';
import '../../models/user.dart';
import '../../providers/account_providers.dart';
import '../../providers/auth_controller.dart';
import '../../core/theme/app_colors.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/email_verify_panel.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';

/// Edit name, phone, where you are (area level only is shown to others) and a short bio.
class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(ownProfileProvider);
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Profile'),
      body: AppBackground(
        child: SafeArea(
          child: profile.when(
            loading: () => ListView(padding: const EdgeInsets.all(20), children: const [Skeleton(height: 380, radius: 24)]),
            error: (e, _) => ListView(
              padding: const EdgeInsets.all(20),
              children: [ErrorState(error: e is ApiException ? e : ApiException.from(e), onRetry: () => ref.invalidate(ownProfileProvider))],
            ),
            data: (p) => _ProfileForm(profile: p),
          ),
        ),
      ),
    );
  }
}

class _ProfileForm extends ConsumerStatefulWidget {
  const _ProfileForm({required this.profile});

  final OwnProfile profile;

  @override
  ConsumerState<_ProfileForm> createState() => _ProfileFormState();
}

class _ProfileFormState extends ConsumerState<_ProfileForm> {
  final _form = GlobalKey<FormState>();
  late final TextEditingController _name;
  late final TextEditingController _phone;
  late final TextEditingController _area;
  late final TextEditingController _city;
  late final TextEditingController _state;
  late final TextEditingController _pincode;
  late final TextEditingController _bio;
  bool _saving = false;
  String? _error;
  GeoPoint? _where;
  String? _whereNote;

  @override
  void initState() {
    super.initState();
    // The one-time redirect after sign-up has done its job once this page is open.
    Future.microtask(() {
      if (mounted) ref.read(authControllerProvider.notifier).welcomed();
    });
    final user = ref.read(authControllerProvider).user;
    final p = widget.profile;
    _name = TextEditingController(text: user?.name ?? '');
    _phone = TextEditingController(text: user?.phone ?? '');
    _area = TextEditingController(text: p.addressArea);
    _city = TextEditingController(text: p.city);
    _state = TextEditingController(text: p.state);
    _pincode = TextEditingController(text: p.pincode);
    _bio = TextEditingController(text: p.bio);
  }

  @override
  void dispose() {
    for (final c in [_name, _phone, _area, _city, _state, _pincode, _bio]) {
      c.dispose();
    }
    super.dispose();
  }

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    final repo = ref.read(accountRepositoryProvider);
    try {
      final user = await repo.updateAccount(name: _name.text, phone: _phone.text);
      await repo.updateProfile(bio: _bio.text, addressArea: _area.text, city: _city.text, state: _state.text, pincode: _pincode.text, lat: _where?.lat, lng: _where?.lng);
      ref.read(authControllerProvider.notifier).adoptUser(user);
      ref.invalidate(ownProfileProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile saved')));
      if (context.canPop()) {
        context.pop();
      } else {
        context.go(Routes.home);
      }
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// "Detect my current location" found the spot and its address: every address field is filled in (replacing what was there).
  void _onDetected(GeoPoint point, GeoPlace? place) {
    setState(() {
      _where = point;
      _whereNote = place == null ? 'Location saved, but we could not look up the address. Please type your address.' : null;
      if (place != null) {
        if (place.area.isNotEmpty) _area.text = place.area;
        if (place.city.isNotEmpty) _city.text = place.city;
        if (place.state.isNotEmpty) _state.text = place.state;
        if (place.postcode.isNotEmpty) _pincode.text = place.postcode;
      }
    });
  }

  /// Finds where the person is, then fills in the area, city, state and pincode from that spot.
  Future<void> _onWhere(GeoPoint? point) async {
    setState(() {
      _where = point;
      _whereNote = null;
    });
    if (point == null) return;
    try {
      final place = await ref.read(geoRepositoryProvider).reverse(point.lat, point.lng);
      if (!mounted || !identical(_where, point)) return;
      if (place == null || (place.area.isEmpty && place.city.isEmpty && place.state.isEmpty && place.postcode.isEmpty)) {
        setState(() => _whereNote = 'Location saved, but nothing is known about this spot. Please type your address.');
        return;
      }
      setState(() {
        if (place.area.isNotEmpty) _area.text = place.area;
        if (place.city.isNotEmpty) _city.text = place.city;
        if (place.state.isNotEmpty) _state.text = place.state;
        if (place.postcode.isNotEmpty) _pincode.text = place.postcode;
        final missing = [
          if (place.area.isEmpty) 'area',
          if (place.city.isEmpty) 'city',
          if (place.state.isEmpty) 'state',
          if (place.postcode.isEmpty) 'pincode',
        ];
        _whereNote = missing.isEmpty
            ? 'Location found. Area, city, state and pincode are filled in. Check them, then save.'
            : 'Location saved and filled in what we could find. Please type the ${missing.join(' and ')}.';
      });
    } on ApiException {
      if (mounted) setState(() => _whereNote = 'Location saved, but we could not look up the address just now. Please type your area, city, state and pincode.');
    }
  }

  Widget _field(TextEditingController c, String label, {String? helper, int maxLines = 1, int? maxLength, TextInputType? keyboard, String? Function(String?)? validator}) =>
      Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: TextFormField(
          controller: c,
          maxLines: maxLines,
          maxLength: maxLength,
          keyboardType: keyboard,
          validator: validator,
          decoration: InputDecoration(labelText: label, helperText: helper),
        ),
      );

  /// A card for one group of fields, with an icon and a heading.
  Widget _section(ThemeData theme, IconData icon, String title, List<Widget> children, {String? hint}) => Padding(
        padding: const EdgeInsets.only(bottom: 16),
        child: GlassContainer(
          radius: 24,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  ExcludeSemantics(
                    child: Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(12)),
                      child: Icon(icon, size: 19, color: theme.colorScheme.primary),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Semantics(header: true, child: Text(title, style: theme.textTheme.titleMedium))),
                ],
              ),
              if (hint != null) ...[const SizedBox(height: 6), Text(hint, style: theme.textTheme.bodySmall)],
              const SizedBox(height: 16),
              ...children,
            ],
          ),
        ),
      );

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final user = ref.watch(authControllerProvider).user;
    final email = user?.email ?? '';
    final shownName = _name.text.trim().isEmpty ? (user?.name ?? '') : _name.text.trim();
    final initial = shownName.isEmpty ? '?' : shownName.substring(0, 1).toUpperCase();
    return Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (_error != null) ...[MessageBanner(message: _error!, tone: BannerTone.error), const SizedBox(height: 12)],
          // Who this is, in the brand colours.
          ClipRRect(
            borderRadius: BorderRadius.circular(26),
            child: DecoratedBox(
              decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: AppColors.heroGradient)),
              child: Padding(
                padding: const EdgeInsets.all(18),
                child: Row(
                  children: [
                    ExcludeSemantics(
                      child: Container(
                        width: 64,
                        height: 64,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: 0.16), border: Border.all(color: Colors.white.withValues(alpha: 0.55), width: 2)),
                        child: Text(initial, style: theme.textTheme.headlineSmall?.copyWith(color: Colors.white)),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('Your details', style: theme.textTheme.titleLarge?.copyWith(color: Colors.white)),
                          const SizedBox(height: 2),
                          Text(
                            user == null ? 'Keep them up to date so people can reach you.' : '${user.role.label}. Keep your details up to date so people can reach you.',
                            style: theme.textTheme.bodySmall?.copyWith(color: Colors.white.withValues(alpha: 0.82)),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
          _section(theme, Icons.mark_email_read_outlined, 'Email', [const EmailVerifyPanel()]),
          _section(theme, Icons.badge_outlined, 'About you', [
            _field(_name, 'Name', maxLength: 80, validator: (v) => (v ?? '').trim().length < 2 ? 'Enter your name' : null),
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: TextFormField(initialValue: email, enabled: false, decoration: const InputDecoration(labelText: 'Email', helperText: 'Your email cannot be changed here.', prefixIcon: Icon(Icons.mail_outline_rounded))),
            ),
            _field(
              _phone,
              'Phone (optional)',
              keyboard: TextInputType.phone,
              validator: (v) {
                final t = (v ?? '').trim();
                return t.isEmpty || RegExp(r'^\+?[0-9\s-]{7,15}$').hasMatch(t) ? null : 'Enter a valid phone number';
              },
            ),
            _field(_bio, 'About you (optional)', maxLines: 3, maxLength: 500),
          ]),
          _section(
            theme,
            Icons.place_outlined,
            'Where you are',
            [
              LocationField(
                value: _where,
                onChanged: _onWhere,
                onDetected: _onDetected,
                title: 'Where are you?',
                blurb: 'Use your location to fill in your address. Others only see a blurred spot, never your exact address.',
              ),
              if (_whereNote != null) Padding(padding: const EdgeInsets.only(top: 8, bottom: 12), child: Text(_whereNote!, style: theme.textTheme.bodyMedium)),
              const SizedBox(height: 12),
              _field(_area, 'Area or locality', helper: 'Others see only your area and city.', maxLength: 100),
              _field(_city, 'City', maxLength: 80),
              _field(_state, 'State', maxLength: 80),
              _field(_pincode, 'PIN code', keyboard: TextInputType.number, maxLength: 12),
            ],
          ),
          const SizedBox(height: 4),
          FilledButton.icon(
            onPressed: _saving ? null : _save,
            icon: const Icon(Icons.check_rounded),
            label: Text(_saving ? 'Saving…' : 'Save profile'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(54)),
          ),
        ],
      ),
    );
  }
}
