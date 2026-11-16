import 'package:material_ui/material_ui.dart';
import '../core/constants/app_constants.dart';
import '../widgets/app_background.dart';

/// Shown while the app starts: it reads the device's storage and tries to restore the last session.
/// The router moves on by itself when that is done (to the introduction, the sign-in screen or the home screen).
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: AppBackground(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.recycling, size: 56, color: theme.colorScheme.primary),
              const SizedBox(height: 12),
              Text(AppConstants.appName, style: theme.textTheme.headlineMedium),
              const SizedBox(height: 6),
              Text('Give your electronics a second life.', style: theme.textTheme.bodyMedium),
              const SizedBox(height: 28),
              const SizedBox(width: 28, height: 28, child: CircularProgressIndicator(strokeWidth: 3)),
            ],
          ),
        ),
      ),
    );
  }
}
