import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/network/api_exception.dart';
import '../../core/theme/app_colors.dart';
import '../../features/home/role_actions.dart';
import '../../models/user.dart';
import '../../providers/account_providers.dart';
import '../../providers/auth_controller.dart';
import '../../providers/chat_providers.dart';
import '../../providers/core_providers.dart';
import '../../routes/route_paths.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/section_header.dart';
import '../admin/admin_home.dart';

/// The home screen. A brand header greets the person and links to messages and notifications; under it come the
/// things that still need their attention (email, provider approval), the tiles for what their role does every day,
/// and the everyday extras. Each action opens its own screen.
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
    if (user.role == UserRole.admin) return AdminHome(name: user.name);
    final notice = verificationMessage(user, me.verificationStatus);
    final main = mainActionsFor(user.role);
    final more = moreActionsFor(user.role);
    final unreadNotifications = ref.watch(unreadNotificationsProvider).valueOrNull ?? 0;
    final unreadMessages = ref.watch(chatUnreadProvider).valueOrNull ?? 0;

    return RefreshIndicator(
      onRefresh: () async {
        await ref.read(authControllerProvider.notifier).reload();
      },
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 120), // room for the floating bar
        children: [
          _Hero(user: user, unreadMessages: unreadMessages, unreadNotifications: unreadNotifications),
          const SizedBox(height: 20),
          if (!user.emailVerified) ...[
            GlassContainer(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.mark_email_unread_outlined, color: AppColors.adapt(context, AppColors.warning), size: 22),
                      const SizedBox(width: 8),
                      Expanded(child: Text('Verify your email address', style: theme.textTheme.titleMedium)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text('We emailed a 6-digit code to ${user.email}. Enter it below to finish. Check your spam folder if you cannot see it.', style: theme.textTheme.bodyMedium),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _code,
                    keyboardType: TextInputType.number,
                    maxLength: 6,
                    inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                    decoration: InputDecoration(labelText: 'Verification code', counterText: '', errorText: _codeProblem),
                    onSubmitted: (_) => _verify(),
                  ),
                  const SizedBox(height: 10),
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
            const SizedBox(height: 16),
          ],
          if (notice != null) ...[
            MessageBanner(
              message: notice,
              tone: BannerTone.info,
              action: TextButton(onPressed: () => context.push(Routes.verification), child: const Text('Open')),
            ),
            const SizedBox(height: 16),
          ],
          const SectionHeader('What you can do'),
          LayoutBuilder(
            builder: (context, box) {
              const gap = 12.0;
              final width = (box.maxWidth - gap) / 2;
              return Wrap(
                spacing: gap,
                runSpacing: gap,
                children: [
                  for (var i = 0; i < main.length; i++)
                    SizedBox(
                      // The last tile of an odd group takes the full row instead of leaving a hole.
                      width: (main.length.isOdd && i == main.length - 1) ? box.maxWidth : width,
                      child: _MainTile(action: main[i], accent: AppColors.tileAccents[i % AppColors.tileAccents.length], wide: main.length.isOdd && i == main.length - 1),
                    ),
                ],
              );
            },
          ),
          if (more.isNotEmpty) ...[
            const SizedBox(height: 24),
            const SectionHeader('More'),
            GlassContainer(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Column(
                children: [
                  for (var i = 0; i < more.length; i++) ...[
                    if (i > 0) Divider(height: 1, indent: 68, endIndent: 16, color: theme.colorScheme.outlineVariant),
                    _MoreRow(action: more[i], accent: AppColors.tileAccents[(i + main.length) % AppColors.tileAccents.length]),
                  ],
                ],
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// The brand header: who is signed in, their role, and quick links to messages and notifications with unread counts.
class _Hero extends StatelessWidget {
  const _Hero({required this.user, required this.unreadMessages, required this.unreadNotifications});

  final AppUser user;
  final int unreadMessages;
  final int unreadNotifications;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final initial = user.firstName.isEmpty ? '?' : user.firstName.characters.first.toUpperCase();
    return Semantics(
      container: true,
      label: 'Hello, ${user.firstName}. ${user.role.label}.',
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: DecoratedBox(
          decoration: const BoxDecoration(
            gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: AppColors.heroGradient),
          ),
          child: Stack(
            children: [
              // Two soft rings in the corner: decoration only.
              Positioned(right: -40, top: -50, child: _Ring(size: 170, alpha: 0.07)),
              Positioned(right: 30, bottom: -60, child: _Ring(size: 120, alpha: 0.06)),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 20, 12, 22),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Semantics(
                          button: user.role != UserRole.admin,
                          label: user.role != UserRole.admin ? 'Your profile' : null,
                          excludeSemantics: user.role != UserRole.admin,
                          child: Material(
                            type: MaterialType.transparency,
                            child: InkResponse(
                              onTap: user.role == UserRole.admin ? null : () => context.push(Routes.profile),
                              radius: 30,
                              child: Container(
                                width: 48,
                                height: 48,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.18), shape: BoxShape.circle, border: Border.all(color: Colors.white.withValues(alpha: 0.35))),
                                child: Text(initial, style: theme.textTheme.titleLarge?.copyWith(color: Colors.white)),
                              ),
                            ),
                          ),
                        ),
                        const Spacer(),
                        _HeroButton(icon: Icons.chat_bubble_outline, label: 'Messages', count: unreadMessages, onTap: () => context.push(Routes.messages)),
                        _HeroButton(icon: Icons.notifications_none, label: 'Notifications', count: unreadNotifications, onTap: () => context.push(Routes.notifications)),
                      ],
                    ),
                    const SizedBox(height: 18),
                    ExcludeSemantics(child: Text('Welcome back', style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: 0.78)))),
                    const SizedBox(height: 2),
                    Padding(
                      padding: const EdgeInsets.only(right: 8),
                      child: ExcludeSemantics(
                        child: Text('Hello, ${user.firstName}', style: theme.textTheme.headlineMedium?.copyWith(color: Colors.white), maxLines: 1, overflow: TextOverflow.ellipsis),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.16), borderRadius: BorderRadius.circular(20)),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const Icon(Icons.recycling, size: 15, color: AppColors.accent),
                          const SizedBox(width: 6),
                          ExcludeSemantics(child: Text(user.role.label, style: theme.textTheme.labelMedium?.copyWith(color: Colors.white, fontWeight: FontWeight.w700))),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Ring extends StatelessWidget {
  const _Ring({required this.size, required this.alpha});

  final double size;
  final double alpha;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: alpha)),
        ),
      );
}

/// A round icon button in the header, with a count badge when something is waiting.
class _HeroButton extends StatelessWidget {
  const _HeroButton({required this.icon, required this.label, required this.count, required this.onTap});

  final IconData icon;
  final String label;
  final int count;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Semantics(
      button: true,
      label: count > 0 ? '$label, $count unread' : label,
      excludeSemantics: true,
      child: Material(
        type: MaterialType.transparency,
        child: InkResponse(
          onTap: onTap,
          radius: 28,
          child: SizedBox(
            width: 48,
            height: 48,
            child: Stack(
              alignment: Alignment.center,
              children: [
                Icon(icon, color: Colors.white, size: 24),
                if (count > 0)
                  Positioned(
                    right: 5,
                    top: 5,
                    child: Container(
                      constraints: const BoxConstraints(minWidth: 18, minHeight: 18),
                      padding: const EdgeInsets.symmetric(horizontal: 4),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: AppColors.accent, borderRadius: BorderRadius.circular(9)),
                      child: Text(count > 99 ? '99+' : '$count', style: theme.textTheme.labelSmall?.copyWith(color: AppColors.onAccent, fontSize: 10.5, fontWeight: FontWeight.w800, height: 1.2)),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// A coloured icon on a soft tinted square, the same for tiles and rows.
class _IconBadge extends StatelessWidget {
  const _IconBadge({required this.icon, required this.accent, this.size = 44});

  final IconData icon;
  final Color accent;
  final double size;

  @override
  Widget build(BuildContext context) {
    final tone = AppColors.adapt(context, accent);
    return ExcludeSemantics(
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: tone.withValues(alpha: 0.13), borderRadius: BorderRadius.circular(size * 0.32)),
        child: Icon(icon, size: size * 0.52, color: tone),
      ),
    );
  }
}

/// A large tile for something the role does every day.
class _MainTile extends StatelessWidget {
  const _MainTile({required this.action, required this.accent, required this.wide});

  final QuickAction action;
  final Color accent;
  final bool wide;

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
        radius: 22,
        child: Material(
          type: MaterialType.transparency,
          child: InkWell(
            borderRadius: BorderRadius.circular(22),
            onTap: ready ? () => context.push(route) : null,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: wide
                  ? Row(
                      children: [
                        _IconBadge(icon: action.icon, accent: accent, size: 50),
                        const SizedBox(width: 14),
                        Expanded(child: _text(theme)),
                        Icon(ready ? Icons.arrow_forward_rounded : Icons.lock_clock_outlined, size: 20, color: AppColors.adapt(context, accent)),
                      ],
                    )
                  : Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            _IconBadge(icon: action.icon, accent: accent, size: 46),
                            Icon(ready ? Icons.arrow_outward_rounded : Icons.lock_clock_outlined, size: 18, color: theme.colorScheme.onSurface.withValues(alpha: 0.4)),
                          ],
                        ),
                        const SizedBox(height: 14),
                        _text(theme),
                      ],
                    ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _text(ThemeData theme) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(action.title, style: theme.textTheme.titleMedium, maxLines: 2, overflow: TextOverflow.ellipsis),
          const SizedBox(height: 4),
          Text(action.subtitle, style: theme.textTheme.bodySmall, maxLines: 3, overflow: TextOverflow.ellipsis),
        ],
      );
}

/// A compact row for an everyday extra: pickups, messages, notifications, guides, profile.
class _MoreRow extends StatelessWidget {
  const _MoreRow({required this.action, required this.accent});

  final QuickAction action;
  final Color accent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final route = action.route;
    final ready = route != null;
    return Semantics(
      button: ready,
      label: ready ? '${action.title}. ${action.subtitle}.' : '${action.title}. ${action.subtitle}. Coming soon.',
      excludeSemantics: true,
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: ready ? () => context.push(route) : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              children: [
                _IconBadge(icon: action.icon, accent: accent, size: 40),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(action.title, style: theme.textTheme.titleSmall),
                      const SizedBox(height: 1),
                      Text(action.subtitle, style: theme.textTheme.bodySmall, maxLines: 1, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                if (ready) Icon(Icons.chevron_right_rounded, color: theme.colorScheme.onSurface.withValues(alpha: 0.4)) else Text('Soon', style: theme.textTheme.labelSmall),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
