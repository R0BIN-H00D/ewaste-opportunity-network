import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/network/api_exception.dart';
import '../../core/validation.dart';
import '../../providers/auth_controller.dart';
import '../../routes/app_router.dart';
import '../../widgets/app_text_field.dart';
import '../../widgets/auth_scaffold.dart';
import '../../widgets/loading_button.dart';
import '../../widgets/message_banner.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _form = GlobalKey<FormState>();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  String? _banner;
  Map<String, String> _fieldErrors = const {};

  @override
  void dispose() {
    _email.dispose();
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
      await ref.read(authControllerProvider.notifier).signIn(email: _email.text, password: _password.text);
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
    return AuthScaffold(
      title: 'Welcome back',
      subtitle: 'Sign in to continue.',
      child: Form(
        key: _form,
        child: AutofillGroup(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_banner != null) ...[MessageBanner(message: _banner!, tone: BannerTone.error), const SizedBox(height: 16)],
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
                controller: _password,
                label: 'Password',
                icon: Icons.lock_outline,
                obscure: true,
                textInputAction: TextInputAction.done,
                autofillHints: const [AutofillHints.password],
                validator: validateLoginPassword,
                serverError: _fieldErrors['password'],
                onChanged: (_) => _clearErrors(),
                onSubmitted: (_) => _submit(),
                enabled: !_busy,
              ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(onPressed: _busy ? null : () => context.push(Routes.forgotPassword), child: const Text('Forgot password?')),
              ),
              const SizedBox(height: 4),
              LoadingButton(label: 'Sign in', loading: _busy, onPressed: _submit),
              const SizedBox(height: 8),
              TextButton(onPressed: _busy ? null : () => context.push(Routes.register), child: const Text('Create an account')),
            ],
          ),
        ),
      ),
    );
  }
}
