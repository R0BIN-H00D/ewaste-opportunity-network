import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/network/api_exception.dart';
import '../../models/account.dart';
import '../../providers/account_providers.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';

/// Theme (kept on the phone and copied to the profile) and which messages to receive.
class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final mode = ref.watch(themeModeProvider);
    final profile = ref.watch(ownProfileProvider);

    Future<void> setPref({bool? email, bool? push}) async {
      try {
        await ref.read(accountRepositoryProvider).updatePreferences(emailNotifications: email, pushNotifications: push);
        ref.invalidate(ownProfileProvider);
      } on ApiException catch (e) {
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
        }
      }
    }

    void choose(ThemeMode m) => ref.read(themeModeProvider.notifier).set(m);

    Widget heading(IconData icon, String text) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Row(
            children: [
              Icon(icon, size: 20, color: theme.colorScheme.primary),
              const SizedBox(width: 8),
              Expanded(child: Semantics(header: true, child: Text(text, style: theme.textTheme.titleMedium))),
            ],
          ),
        );

    Widget switchRow(IconData icon, bool value, ValueChanged<bool> onChanged, String title, String subtitle) => SwitchListTile(
          value: value,
          onChanged: onChanged,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16),
          secondary: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.12), borderRadius: BorderRadius.circular(13)),
            child: Icon(icon, size: 20, color: theme.colorScheme.primary),
          ),
          title: Text(title, style: theme.textTheme.titleSmall),
          subtitle: Text(subtitle, style: theme.textTheme.bodySmall),
        );

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Settings'),
      body: AppBackground(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              heading(Icons.palette_outlined, 'Appearance'),
              GlassContainer(
                radius: 24,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(child: _ThemeChoice(icon: Icons.brightness_auto_rounded, label: 'Same as the phone', selected: mode == ThemeMode.system, onTap: () => choose(ThemeMode.system))),
                        const SizedBox(width: 10),
                        Expanded(child: _ThemeChoice(icon: Icons.light_mode_rounded, label: 'Light', selected: mode == ThemeMode.light, onTap: () => choose(ThemeMode.light))),
                        const SizedBox(width: 10),
                        Expanded(child: _ThemeChoice(icon: Icons.dark_mode_rounded, label: 'Dark', selected: mode == ThemeMode.dark, onTap: () => choose(ThemeMode.dark))),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              heading(Icons.mark_email_unread_outlined, 'Messages'),
              GlassContainer(
                padding: const EdgeInsets.symmetric(vertical: 6),
                radius: 24,
                child: Material(
                  type: MaterialType.transparency,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      profile.maybeWhen(
                        data: (OwnProfile p) => Column(
                          children: [
                            switchRow(Icons.alternate_email_rounded, p.emailNotifications, (v) => setPref(email: v), 'Email updates', 'Quotes, handovers and other changes to your requests.'),
                            Divider(height: 1, indent: 72, endIndent: 16, color: theme.colorScheme.outlineVariant),
                            switchRow(Icons.notifications_active_outlined, p.pushNotifications, (v) => setPref(push: v), 'Phone notifications', 'Alerts on this phone when something needs you.'),
                          ],
                        ),
                        orElse: () => const Padding(padding: EdgeInsets.all(16), child: LinearProgressIndicator()),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Icon(Icons.info_outline_rounded, size: 16, color: theme.textTheme.bodySmall?.color),
                            const SizedBox(width: 8),
                            Expanded(child: Text('Updates always appear in Notifications in the app.', style: theme.textTheme.bodySmall)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One of the three ways to choose the look of the app, as a card with a picture of the idea.
class _ThemeChoice extends StatelessWidget {
  const _ThemeChoice({required this.icon, required this.label, required this.selected, required this.onTap});

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: Material(
        color: selected ? scheme.primary.withValues(alpha: 0.12) : Colors.transparent,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            constraints: const BoxConstraints(minHeight: 96),
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: selected ? scheme.primary : scheme.outline, width: selected ? 2 : 1),
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Icon(icon, size: 28, color: selected ? scheme.primary : scheme.onSurface.withValues(alpha: 0.65)),
                    if (selected) Positioned(right: -8, top: -6, child: Icon(Icons.check_circle_rounded, size: 16, color: scheme.primary)),
                  ],
                ),
                const SizedBox(height: 8),
                Text(label, style: theme.textTheme.labelMedium?.copyWith(color: selected ? scheme.primary : scheme.onSurface, fontWeight: FontWeight.w700), textAlign: TextAlign.center),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
