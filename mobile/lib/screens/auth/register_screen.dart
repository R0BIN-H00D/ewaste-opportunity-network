import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/network/api_exception.dart';
import '../../core/validation.dart';
import '../../models/user.dart';
import '../../providers/auth_controller.dart';
import '../../routes/app_router.dart';
import '../../widgets/app_text_field.dart';
import '../../widgets/auth_scaffold.dart';
import '../../widgets/loading_button.dart';
import '../../widgets/message_banner.dart';

/// Registration. The first section is the role choice; provider roles are told they need an administrator's approval.
class RegisterScreen extends ConsumerStatefulWidget {
  const RegisterScreen({super.key});

  @override
  ConsumerState<RegisterScreen> createState() => _RegisterScreenState();
}

class _RegisterScreenState extends ConsumerState<RegisterScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _organization = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  UserRole _role = UserRole.user;
  bool _busy = false;
  String? _banner;
  Map<String, String> _fieldErrors = const {};

  @override
  void dispose() {
    for (final c in [_name, _email, _phone, _organization, _password, _confirm]) {
      c.dispose();
    }
    super.dispose();
  }

  void _clearErrors() {
    if (_banner == null && _fieldErrors.isEmpty) return;
    setState(() {
      _banner = null;
      _fieldErrors = const {};
    });
  }

  Future<void> _submit() async {
    if (_busy || !(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _banner = null;
      _fieldErrors = const {};
    });
    try {
      await ref.read(authControllerProvider.notifier).register(
            name: _name.text,
            email: _email.text,
            password: _password.text,
            role: _role,
            phone: _phone.text,
            organizationName: _role.needsOrganization ? _organization.text : null,
          );
      // The router sees the new session and opens the home screen.
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _fieldErrors = e.fieldErrors;
        _banner = e.fieldErrors.isEmpty ? e.message : null;
      });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AuthScaffold(
      title: 'Create your account',
      subtitle: 'Choose how you want to use the app.',
      showBack: true,
      child: Form(
        key: _form,
        child: AutofillGroup(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_banner != null) ...[MessageBanner(message: _banner!, tone: BannerTone.error), const SizedBox(height: 16)],
              Text('I am joining as', style: theme.textTheme.labelSmall),
              const SizedBox(height: 8),
              RadioGroup<UserRole>(
                groupValue: _role,
                onChanged: (value) {
                  if (value == null || _busy) return;
                  _clearErrors();
                  setState(() => _role = value);
                },
                // The glass card paints a background, which would hide the tiles' touch feedback; give them their own Material.
                child: Material(
                  type: MaterialType.transparency,
                  child: Column(
                    children: [
                      for (final role in registrationRoles)
                        RadioListTile<UserRole>(
                          value: role,
                          contentPadding: EdgeInsets.zero,
                          title: Text(role.label),
                          subtitle: Text(role.blurb),
                        ),
                    ],
                  ),
                ),
              ),
              if (_role.isProvider) ...[
                const SizedBox(height: 8),
                const MessageBanner(
                  message: 'Provider accounts are checked by an administrator before you can offer services. You can sign in and submit your documents straight away.',
                  tone: BannerTone.info,
                ),
              ],
              const SizedBox(height: 16),
              AppTextField(
                controller: _name,
                label: 'Full name',
                icon: Icons.person_outline,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.name],
                validator: validateName,
                serverError: _fieldErrors['name'],
                onChanged: (_) => _clearErrors(),
                enabled: !_busy,
              ),
              const SizedBox(height: 14),
              AppTextField(
                controller: _email,
                label: 'Email',
                icon: Icons.mail_outline,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.email],
                validator: validateEmail,
                serverError: _fieldErrors['email'],
                onChanged: (_) => _clearErrors(),
                enabled: !_busy,
              ),
              const SizedBox(height: 14),
              AppTextField(
                controller: _phone,
                label: 'Phone (optional)',
                icon: Icons.phone_outlined,
                keyboardType: TextInputType.phone,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.telephoneNumber],
                validator: validatePhone,
                serverError: _fieldErrors['phone'],
                onChanged: (_) => _clearErrors(),
                enabled: !_busy,
              ),
              if (_role.needsOrganization) ...[
                const SizedBox(height: 14),
                AppTextField(
                  controller: _organization,
                  label: 'Organisation name',
                  icon: Icons.business_outlined,
                  textInputAction: TextInputAction.next,
                  validator: validateOrganization,
                  serverError: _fieldErrors['organizationName'],
                  onChanged: (_) => _clearErrors(),
                  enabled: !_busy,
                ),
              ],
              const SizedBox(height: 14),
              AppTextField(
                controller: _password,
                label: 'Password',
                icon: Icons.lock_outline,
                obscure: true,
                textInputAction: TextInputAction.next,
                autofillHints: const [AutofillHints.newPassword],
                validator: validateNewPassword,
                serverError: _fieldErrors['password'],
                onChanged: (_) => _clearErrors(),
                enabled: !_busy,
              ),
              const SizedBox(height: 6),
              Text('At least 8 characters, with a letter and a number.', style: theme.textTheme.labelSmall),
              const SizedBox(height: 14),
              AppTextField(
                controller: _confirm,
                label: 'Confirm password',
                icon: Icons.lock_outline,
                obscure: true,
                textInputAction: TextInputAction.done,
                validator: (value) => value == _password.text ? null : 'The passwords do not match',
                onSubmitted: (_) => _submit(),
                enabled: !_busy,
              ),
              const SizedBox(height: 20),
              LoadingButton(label: 'Create account', loading: _busy, onPressed: _submit),
              const SizedBox(height: 8),
              TextButton(onPressed: _busy ? null : () => context.go(Routes.login), child: const Text('I already have an account')),
            ],
          ),
        ),
      ),
    );
  }
}
