import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/network/api_exception.dart';
import '../../models/account.dart';
import '../../providers/account_providers.dart';
import '../../providers/auth_controller.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
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

  @override
  void initState() {
    super.initState();
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
      await repo.updateProfile(bio: _bio.text, addressArea: _area.text, city: _city.text, state: _state.text, pincode: _pincode.text);
      ref.read(authControllerProvider.notifier).adoptUser(user);
      ref.invalidate(ownProfileProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile saved')));
      context.pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
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

  @override
  Widget build(BuildContext context) {
    final email = ref.watch(authControllerProvider).user?.email ?? '';
    return Form(
      key: _form,
      child: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          if (_error != null) ...[MessageBanner(message: _error!, tone: BannerTone.error), const SizedBox(height: 12)],
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _field(_name, 'Name', maxLength: 80, validator: (v) => (v ?? '').trim().length < 2 ? 'Enter your name' : null),
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: TextFormField(initialValue: email, enabled: false, decoration: const InputDecoration(labelText: 'Email', helperText: 'Your email cannot be changed here.')),
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
                _field(_area, 'Area or locality', helper: 'Others see only your area and city.', maxLength: 100),
                _field(_city, 'City', maxLength: 80),
                _field(_state, 'State', maxLength: 80),
                _field(_pincode, 'PIN code', keyboard: TextInputType.number, maxLength: 12),
                _field(_bio, 'About you (optional)', maxLines: 3, maxLength: 500),
              ],
            ),
          ),
          const SizedBox(height: 16),
          FilledButton(onPressed: _saving ? null : _save, child: Text(_saving ? 'Saving…' : 'Save profile')),
        ],
      ),
    );
  }
}
