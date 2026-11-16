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

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  bool _busy = false;
  bool _sent = false;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !(_form.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(authRepositoryProvider).forgotPassword(_email.text);
      if (mounted) setState(() => _sent = true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.fieldErrors['email'] ?? e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return AuthScaffold(
      title: 'Reset your password',
      subtitle: 'We will email you a code that works for one hour.',
      showBack: true,
      child: Form(
        key: _form,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_sent) ...[
              const MessageBanner(
                message: 'If that email is registered, a reset link and code are on their way. Open the email, copy the code and enter it on the next screen.',
                tone: BannerTone.success,
              ),
              const SizedBox(height: 16),
              FilledButton(onPressed: () => context.push(Routes.resetPassword), child: const Text('I have my code')),
              const SizedBox(height: 8),
              TextButton(onPressed: _busy ? null : () => setState(() => _sent = false), child: const Text('Use a different email')),
            ] else ...[
              if (_error != null) ...[MessageBanner(message: _error!, tone: BannerTone.error), const SizedBox(height: 16)],
              AppTextField(
                controller: _email,
                label: 'Email',
                icon: Icons.mail_outline,
                keyboardType: TextInputType.emailAddress,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.email],
                validator: validateEmail,
                onChanged: (_) {
                  if (_error != null) setState(() => _error = null);
                },
                onSubmitted: (_) => _submit(),
                enabled: !_busy,
              ),
              const SizedBox(height: 20),
              LoadingButton(label: 'Send reset email', loading: _busy, onPressed: _submit),
              const SizedBox(height: 8),
              TextButton(onPressed: _busy ? null : () => context.push(Routes.resetPassword), child: const Text('I already have a code')),
            ],
          ],
        ),
      ),
    );
  }
}
