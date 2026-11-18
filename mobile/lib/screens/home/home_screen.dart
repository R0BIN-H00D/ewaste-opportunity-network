import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/network/api_exception.dart';
import '../../features/home/role_actions.dart';
import '../../models/user.dart';
import '../../providers/auth_controller.dart';
import '../../providers/core_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/message_banner.dart';

/// The home screen. It greets the person, says what still needs their attention (email, provider approval) and
/// lists what their role can do. Each action opens its screen as those arrive in later slices.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  bool _sending = false;
  bool _checking = false;
  final _code = TextEditingController();
  String? _codeProblem;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _resend() async {
    setState(() => _sending = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      final delivery = await ref.read(authRepositoryProvider).resendVerification();
      messenger.showSnackBar(SnackBar(
          content: Text(delivery == 'console'
              ? 'The server has no email service set up, so no email was sent. Ask the administrator to set it up.'
              : 'A new code was sent. It is valid for 15 minutes.')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _verify() async {
    final code = _code.text.trim();
    if (!RegExp(r'^\d{6}$').hasMatch(code)) {
      setState(() => _codeProblem = 'Enter the 6-digit code from your email.');
      return;
    }
    setState(() {
      _checking = true;
      _codeProblem = null;
    });
    try {
      await ref.read(authRepositoryProvider).verifyEmailCode(code);
      await ref.read(authControllerProvider.notifier).reload();
    } on ApiException catch (e) {
      if (mounted) setState(() => _codeProblem = e.message);
    } finally {
      if (mounted) setState(() => _checking = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final me = ref.watch(authControllerProvider).me;
    if (me == null) return const SizedBox.shrink();
    final user = me.user;
    final notice = verificationMessage(user, me.verificationStatus);
    final actions = actionsFor(user.role);

    return RefreshIndicator(
      onRefresh: () async {
        await ref.read(authControllerProvider.notifier).reload();
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
            20, 20, 20, 110), // room for the floating bar
        children: [
          Semantics(
              header: true,
              child: Text('Hello, ${user.firstName}',
                  style: theme.textTheme.headlineMedium)),
          const SizedBox(height: 4),
          Text(user.role.label, style: theme.textTheme.bodyMedium),
          const SizedBox(height: 16),
          if (!user.emailVerified) ...[
            GlassContainer(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Verify your email address', style: theme.textTheme.titleLarge?.copyWith(fontSize: 16)),
                  const SizedBox(height: 4),
                  Text('We emailed a 6-digit code to ${user.email}. Enter it below to finish. Check your spam folder if you cannot see it.', style: theme.textTheme.bodyMedium),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _code,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(labelText: 'Verification code', counterText: '', errorText: _codeProblem),
                    onSubmitted: (_) => _verify(),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      FilledButton(onPressed: _checking ? null : _verify, child: Text(_checking ? 'Checking…' : 'Verify')),
                      const SizedBox(width: 8),
                      TextButton(onPressed: _sending ? null : _resend, child: Text(_sending ? 'Sending…' : 'Resend code')),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
          ],
          if (notice != null) ...[
            MessageBanner(
              message: notice,
              tone: BannerTone.info,
              action: TextButton(
                  onPressed: () => context.push(Routes.verification),
                  child: const Text('Open')),
            ),
            const SizedBox(height: 12),
          ],
          Semantics(
              header: true,
              child:
                  Text('What you can do', style: theme.textTheme.titleLarge)),
          const SizedBox(height: 12),
          for (final action in actions) ...[
            _ActionTile(action: action),
            const SizedBox(height: 12)
          ],
        ],
      ),
    );
  }
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.action});

  final QuickAction action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final route = action.route;
    final ready = route != null;
    return Semantics(
      button: ready,
      label: ready
          ? '${action.title}. ${action.subtitle}.'
          : '${action.title}. ${action.subtitle}. Coming soon.',
      excludeSemantics: true,
      child: GlassContainer(
        padding: EdgeInsets.zero,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(24),
            onTap: ready ? () => context.push(route) : null,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Icon(action.icon, size: 28, color: theme.colorScheme.primary),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(action.title,
                            style: theme.textTheme.titleLarge
                                ?.copyWith(fontSize: 16)),
                        const SizedBox(height: 2),
                        Text(action.subtitle,
                            style: theme.textTheme.bodyMedium),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (ready)
                    const Icon(Icons.chevron_right)
                  else
                    Text('Soon', style: theme.textTheme.labelSmall),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
