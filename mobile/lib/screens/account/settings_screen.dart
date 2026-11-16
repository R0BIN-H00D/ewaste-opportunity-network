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

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Settings'),
      body: AppBackground(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Semantics(header: true, child: Text('Appearance', style: theme.textTheme.titleLarge)),
              const SizedBox(height: 8),
              GlassContainer(
                child: Material(
                  type: MaterialType.transparency,
                  child: RadioGroup<ThemeMode>(
                    groupValue: mode,
                    onChanged: (m) {
                      if (m != null) {
                        ref.read(themeModeProvider.notifier).set(m);
                      }
                    },
                    child: const Column(
                      children: [
                        RadioListTile<ThemeMode>(value: ThemeMode.system, title: Text('Same as the phone')),
                        RadioListTile<ThemeMode>(value: ThemeMode.light, title: Text('Light')),
                        RadioListTile<ThemeMode>(value: ThemeMode.dark, title: Text('Dark')),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Semantics(header: true, child: Text('Messages', style: theme.textTheme.titleLarge)),
              const SizedBox(height: 8),
              GlassContainer(
                child: Material(
                  type: MaterialType.transparency,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      profile.maybeWhen(
                        data: (OwnProfile p) => Column(
                          children: [
                            SwitchListTile(
                              value: p.emailNotifications,
                              onChanged: (v) => setPref(email: v),
                              title: const Text('Email updates'),
                              subtitle: const Text('Quotes, handovers and other changes to your requests.'),
                            ),
                            SwitchListTile(
                              value: p.pushNotifications,
                              onChanged: (v) => setPref(push: v),
                              title: const Text('Phone notifications'),
                              subtitle: const Text('Alerts on this phone when something needs you.'),
                            ),
                          ],
                        ),
                        orElse: () => const Padding(padding: EdgeInsets.all(16), child: LinearProgressIndicator()),
                      ),
                      Padding(
                        padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
                        child: Text('Updates always appear in Notifications in the app.', style: theme.textTheme.bodyMedium),
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
