import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/network/api_exception.dart';
import '../../features/home/role_actions.dart';
import '../../models/user.dart';
import '../../providers/auth_controller.dart';
import '../../providers/core_providers.dart';
import '../../providers/impact_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/green_ring.dart';
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

  Future<void> _resend() async {
    setState(() => _sending = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await ref.read(authRepositoryProvider).resendVerification();
      messenger.showSnackBar(const SnackBar(content: Text('Verification email sent. Check your inbox.')));
    } on ApiException catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _sending = false);
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
        ref.invalidate(greenScoreProvider);
        await ref.read(authControllerProvider.notifier).reload();
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 110), // room for the floating bar
        children: [
          Semantics(header: true, child: Text('Hello, ${user.firstName}', style: theme.textTheme.headlineMedium)),
          const SizedBox(height: 4),
          Text(user.role.label, style: theme.textTheme.bodyMedium),
          const SizedBox(height: 16),
          if (!user.emailVerified) ...[
            MessageBanner(
              message: 'Please verify your email address. We sent you a link when you signed up.',
              tone: BannerTone.warning,
              action: TextButton(onPressed: _sending ? null : _resend, child: Text(_sending ? 'Sending…' : 'Resend')),
            ),
            const SizedBox(height: 12),
          ],
          if (notice != null) ...[
            MessageBanner(
              message: notice,
              tone: BannerTone.info,
              action: TextButton(onPressed: () => context.push(Routes.verification), child: const Text('Open')),
            ),
            const SizedBox(height: 12),
          ],
          if (user.role != UserRole.admin) ...[const _GreenScoreCard(), const SizedBox(height: 20)],
          Semantics(header: true, child: Text('What you can do', style: theme.textTheme.titleLarge)),
          const SizedBox(height: 12),
          for (final action in actions) ...[_ActionTile(action: action), const SizedBox(height: 12)],
        ],
      ),
    );
  }
}

/// The Green Score on Home: a ring through the current level, the level's name, and how far to the next. Opens the full page.
/// If the score cannot be fetched it still opens the page, which says why, rather than showing a number that may be stale.
class _GreenScoreCard extends ConsumerWidget {
  const _GreenScoreCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final score = ref.watch(greenScoreProvider);

    Widget content(Widget leading, String title, String subtitle) => Row(
          children: [
            leading,
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [Text(title, style: theme.textTheme.titleLarge), const SizedBox(height: 2), Text(subtitle, style: theme.textTheme.bodyMedium)],
              ),
            ),
            const Icon(Icons.chevron_right),
          ],
        );

    final body = score.when(
      loading: () => content(const SizedBox(width: 72, height: 72, child: Center(child: CircularProgressIndicator(strokeWidth: 3))), 'Green Score', 'Loading...'),
      error: (_, __) => content(Icon(Icons.eco_outlined, size: 48, color: theme.colorScheme.primary), 'Green Score', 'Tap to see your score.'),
      data: (s) => content(
        GreenRing(score: s.score, level: s.level),
        'Green Score · ${s.level.name}',
        s.score == 0 && s.ledger.isEmpty ? 'Complete an activity to start earning points.' : (s.level.isTop ? 'You have reached the highest level.' : '${s.level.pointsToNext(s.score)} points to ${s.level.nextName}'),
      ),
    );

    return Semantics(
      button: true,
      child: GlassContainer(
        padding: EdgeInsets.zero,
        // A transparent Material so the ripple draws on the glass instead of under it.
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(onTap: () => context.push(Routes.impact), child: Padding(padding: const EdgeInsets.all(16), child: body)),
        ),
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
      label: ready ? '${action.title}. ${action.subtitle}.' : '${action.title}. ${action.subtitle}. Coming soon.',
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
                        Text(action.title, style: theme.textTheme.titleLarge?.copyWith(fontSize: 16)),
                        const SizedBox(height: 2),
                        Text(action.subtitle, style: theme.textTheme.bodyMedium),
                      ],
                    ),
                  ),
                  const SizedBox(width: 8),
                  if (ready) const Icon(Icons.chevron_right) else Text('Soon', style: theme.textTheme.labelSmall),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
