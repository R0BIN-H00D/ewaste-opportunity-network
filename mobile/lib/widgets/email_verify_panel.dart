import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../core/network/api_exception.dart';
import '../providers/auth_controller.dart';
import '../providers/core_providers.dart';
import 'message_banner.dart';

/// Email verification on the profile. "Verify my email" sends a 6-digit code to the account's email address; typing it here
/// confirms the address. Nothing is sent until the person presses the button.
class EmailVerifyPanel extends ConsumerStatefulWidget {
  const EmailVerifyPanel({super.key});

  @override
  ConsumerState<EmailVerifyPanel> createState() => _EmailVerifyPanelState();
}

enum _Phase { idle, sending, sent, checking }

class _EmailVerifyPanelState extends ConsumerState<EmailVerifyPanel> {
  final _code = TextEditingController();
  _Phase _phase = _Phase.idle;
  String? _problem;
  String? _note;
  bool _noteIsError = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _send(String email) async {
    setState(() {
      _phase = _Phase.sending;
      _problem = null;
      _note = null;
    });
    try {
      final delivery = await ref.read(authRepositoryProvider).resendVerification();
      if (!mounted) return;
      // "console" means the server has no email service set up, so nothing reached an inbox.
      if (delivery == 'console') {
        setState(() {
          _phase = _Phase.idle;
          _note = 'The server has no email service set up, so no email was sent. Ask the administrator to set it up.';
          _noteIsError = true;
        });
      } else {
        setState(() {
          _phase = _Phase.sent;
          _note = 'We sent a 6-digit code to $email. It is valid for 15 minutes. Check your spam folder if you cannot see it.';
          _noteIsError = false;
        });
      }
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _phase = _code.text.isEmpty ? _Phase.idle : _Phase.sent;
        _note = e.message;
        _noteIsError = true;
      });
    }
  }

  Future<void> _verify() async {
    final code = _code.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(code)) {
      setState(() => _problem = 'Enter the 6-digit code from your email.');
      return;
    }
    setState(() {
      _phase = _Phase.checking;
      _problem = null;
    });
    try {
      await ref.read(authRepositoryProvider).verifyEmailCode(code);
      await ref.read(authControllerProvider.notifier).reload(); // the account now says "verified", and this panel changes with it
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _phase = _Phase.sent;
          _problem = e.message;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final user = ref.watch(authControllerProvider).user;
    if (user == null) return const SizedBox.shrink();

    if (user.emailVerified) {
      return Row(children: [
        Icon(Icons.verified_rounded, color: theme.colorScheme.primary),
        const SizedBox(width: 10),
        Expanded(child: Text('${user.email} is verified.', style: theme.textTheme.bodyLarge)),
      ]);
    }

    final busy = _phase == _Phase.sending || _phase == _Phase.checking;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('${user.email} is not verified yet. Confirm that this address is yours: we send a 6-digit code to it.', style: theme.textTheme.bodyMedium),
        const SizedBox(height: 12),
        if (_phase == _Phase.idle || _phase == _Phase.sending)
          FilledButton.icon(
            onPressed: busy ? null : () => _send(user.email),
            icon: busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.mark_email_read_outlined),
            label: Text(_phase == _Phase.sending ? 'Sending…' : 'Verify my email'),
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          )
        else ...[
          TextField(
            controller: _code,
            keyboardType: TextInputType.number,
            maxLength: 6,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            decoration: InputDecoration(labelText: 'Verification code', counterText: '', errorText: _problem),
            onSubmitted: (_) => _verify(),
          ),
          const SizedBox(height: 10),
          FilledButton(
            onPressed: busy ? null : _verify,
            style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            child: Text(_phase == _Phase.checking ? 'Checking…' : 'Verify'),
          ),
          const SizedBox(height: 8),
          OutlinedButton(
            onPressed: busy ? null : () => _send(user.email),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
            child: const Text('Send a new code'),
          ),
        ],
        if (_note != null) ...[
          const SizedBox(height: 12),
          MessageBanner(message: _note!, tone: _noteIsError ? BannerTone.error : BannerTone.info),
        ],
      ],
    );
  }
}
