import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/theme/app_colors.dart';
import '../../models/user.dart';
import '../../providers/auth_controller.dart';
import '../../routes/route_paths.dart';
import '../../widgets/menu_section.dart';
import 'about_dialog.dart';

/// The icon that stands for each role.
IconData roleIcon(UserRole role) {
  switch (role) {
    case UserRole.user:
      return Icons.person_rounded;
    case UserRole.technician:
      return Icons.build_rounded;
    case UserRole.refurbisher:
      return Icons.autorenew_rounded;
    case UserRole.recycler:
      return Icons.recycling_rounded;
    case UserRole.admin:
      return Icons.admin_panel_settings_rounded;
  }
}

/// Who is signed in, the way to everything about the account, and the way out.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key});

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You will need to sign in again to use the app on this phone.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Sign out')),
        ],
      ),
    );
    if (yes == true) await ref.read(authControllerProvider.notifier).signOut();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final me = ref.watch(authControllerProvider).me;
    final user = me?.user;
    if (user == null) return const SizedBox.shrink();
    Widget row(IconData icon, Color accent, String title, String subtitle, String route) => MenuRow(
          icon: icon,
          accent: accent,
          title: title,
          subtitle: subtitle,
          onTap: () => context.push(route),
        );

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 120),
      children: [
        _ProfileHero(user: user, verificationStatus: me?.verificationStatus),
        const SizedBox(height: 24),
        MenuSection(caption: 'Your account', rows: [
          row(Icons.person_outline_rounded, AppColors.tileAccents[0], 'Profile', 'Name, phone and your area', Routes.profile),
          if (user.role.isProvider) row(Icons.verified_user_outlined, AppColors.tileAccents[2], 'Verification', 'Your documents and approval', Routes.verification),
        ]),
        const SizedBox(height: 20),
        MenuSection(caption: 'Preferences', rows: [
          row(Icons.tune_rounded, AppColors.tileAccents[4], 'Settings', 'Theme and messages', Routes.settings),
        ]),
        if (user.role == UserRole.user) ...[
          const SizedBox(height: 12),
          MenuSection(rows: [
            row(Icons.menu_book_outlined, AppColors.tileAccents[0], 'Learning centre',
                'Guides on safe disposal, repair and protecting your data', Routes.learn),
          ]),
        ],
        const SizedBox(height: 20),
        MenuSection(rows: [
          MenuRow(
            icon: Icons.info_outline_rounded,
            accent: AppColors.tileAccents[1],
            title: 'About',
            subtitle: 'App, team and version',
            onTap: () => showDialog<void>(context: context, builder: (_) => const AppAboutDialog()),
          ),
        ]),
        const SizedBox(height: 28),
        OutlinedButton.icon(
          onPressed: () => _confirmSignOut(context, ref),
          icon: const Icon(Icons.logout_rounded),
          label: const Text('Sign out'),
          style: OutlinedButton.styleFrom(
            foregroundColor: theme.colorScheme.error,
            side: BorderSide(color: theme.colorScheme.error.withValues(alpha: 0.5)),
            minimumSize: const Size(48, 52),
          ),
        ),
      ],
    );
  }
}

/// The profile card at the top: a big avatar, the name and email, the role, and a provider's approval status.
class _ProfileHero extends StatelessWidget {
  const _ProfileHero({required this.user, required this.verificationStatus});

  final AppUser user;
  final String? verificationStatus;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final initial = user.name.trim().isEmpty ? '?' : user.name.trim().substring(0, 1).toUpperCase();
    final status = verificationStatus ?? 'not_submitted';
    final approved = status == 'approved';
    return Semantics(
      container: true,
      label: '${user.name}. ${user.email}. ${user.role.label}.${user.role.isProvider ? ' Approval: ${verificationLabels[status] ?? status}.' : ''}',
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: DecoratedBox(
          decoration: const BoxDecoration(gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: AppColors.heroGradient)),
          child: Stack(
            children: [
              Positioned(right: -50, top: -60, child: _ring(190, 0.07)),
              Positioned(left: -40, bottom: -70, child: _ring(150, 0.06)),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 22, 20, 22),
                child: Column(
                  children: [
                    ExcludeSemantics(
                      child: Container(
                        width: 84,
                        height: 84,
                        alignment: Alignment.center,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: Colors.white.withValues(alpha: 0.16),
                          border: Border.all(color: Colors.white.withValues(alpha: 0.55), width: 2.5),
                        ),
                        child: Text(initial, style: theme.textTheme.headlineMedium?.copyWith(color: Colors.white, fontSize: 34)),
                      ),
                    ),
                    const SizedBox(height: 14),
                    ExcludeSemantics(child: Text(user.name, style: theme.textTheme.titleLarge?.copyWith(color: Colors.white, fontSize: 22), textAlign: TextAlign.center, maxLines: 2, overflow: TextOverflow.ellipsis)),
                    const SizedBox(height: 2),
                    ExcludeSemantics(child: Text(user.email, style: theme.textTheme.bodyMedium?.copyWith(color: Colors.white.withValues(alpha: 0.8)), textAlign: TextAlign.center, maxLines: 1, overflow: TextOverflow.ellipsis)),
                    const SizedBox(height: 14),
                    Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        _Pill(icon: roleIcon(user.role), label: user.role.label, background: Colors.white.withValues(alpha: 0.16), color: Colors.white, iconColor: AppColors.accent),
                        if (user.role.isProvider)
                          _Pill(
                            icon: approved ? Icons.verified_rounded : Icons.hourglass_top_rounded,
                            label: verificationLabels[status] ?? status,
                            background: approved ? AppColors.accent : Colors.white.withValues(alpha: 0.16),
                            color: approved ? AppColors.onAccent : Colors.white,
                            iconColor: approved ? AppColors.onAccent : Colors.white,
                          ),
                      ],
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

  Widget _ring(double size, double alpha) => ExcludeSemantics(child: Container(width: size, height: size, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.white.withValues(alpha: alpha))));
}

class _Pill extends StatelessWidget {
  const _Pill({required this.icon, required this.label, required this.background, required this.color, required this.iconColor});

  final IconData icon;
  final String label;
  final Color background;
  final Color color;
  final Color iconColor;

  @override
  Widget build(BuildContext context) => ExcludeSemantics(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
          decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(20)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 15, color: iconColor),
              const SizedBox(width: 6),
              Flexible(child: Text(label, style: Theme.of(context).textTheme.labelMedium?.copyWith(color: color, fontWeight: FontWeight.w800))),
            ],
          ),
        ),
      );
}
