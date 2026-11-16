import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/network/api_exception.dart';
import '../../core/validation.dart';
import '../../providers/core_providers.dart';
import '../../routes/app_router.dart';
import '../../widgets/app_text_field.dart';
import '../../widgets/auth_scaffold.dart';
import '../../widgets/loading_button.dart';
import '../../widgets/message_banner.dart';

/// Sets a new password with the code from the reset email. (Opening the emailed link inside the app arrives with deep links.)
class ResetPasswordScreen extends ConsumerStatefulWidget {
  const ResetPasswordScreen({super.key});

  @override
  ConsumerState<ResetPasswordScreen> createState() => _ResetPasswordScreenState();
}

class _ResetPasswordScreenState extends ConsumerState<ResetPasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _token = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _done = false;
  String? _banner;
  Map<String, String> _fieldErrors = const {};

  @override
  void dispose() {
    _token.dispose();
    _password.dispose();
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
      await ref.read(authRepositoryProvider).resetPassword(token: _token.text, password: _password.text);
      if (mounted) setState(() => _done = true);
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
    return AuthScaffold(
      title: 'Choose a new password',
      subtitle: 'Signing in again is needed on every device after a reset.',
      showBack: true,
      child: _done
          ? Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const MessageBanner(message: 'Your password was changed. Please sign in with the new one.', tone: BannerTone.success),
                const SizedBox(height: 16),
                FilledButton(onPressed: () => context.go(Routes.login), child: const Text('Go to sign in')),
              ],
            )
          : Form(
              key: _form,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (_banner != null) ...[MessageBanner(message: _banner!, tone: BannerTone.error), const SizedBox(height: 16)],
                  AppTextField(
                    controller: _token,
                    label: 'Code from the email',
                    icon: Icons.key_outlined,
                    textInputAction: TextInputAction.next,
                    validator: validateResetToken,
                    serverError: _fieldErrors['token'],
                    onChanged: (_) => _clearErrors(),
                    enabled: !_busy,
                  ),
                  const SizedBox(height: 14),
                  AppTextField(
                    controller: _password,
                    label: 'New password',
                    icon: Icons.lock_outline,
                    obscure: true,
                    textInputAction: TextInputAction.done,
                    autofillHints: const [AutofillHints.newPassword],
                    validator: validateNewPassword,
                    serverError: _fieldErrors['password'],
                    onChanged: (_) => _clearErrors(),
                    onSubmitted: (_) => _submit(),
                    enabled: !_busy,
                  ),
                  const SizedBox(height: 20),
                  LoadingButton(label: 'Change password', loading: _busy, onPressed: _submit),
                ],
              ),
            ),
    );
  }
}
