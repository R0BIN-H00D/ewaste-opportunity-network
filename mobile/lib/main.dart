import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'core/constants/app_constants.dart';
import 'core/theme/app_theme.dart';
import 'providers/account_providers.dart';
import 'routes/app_router.dart';
import 'widgets/saved_data_banner.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  // Draw behind the status and navigation bars. Screens keep clear of them with SafeArea.
  SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
  // Firebase.initializeApp() is added in Phase 8 once google-services.json exists.
  runApp(const ProviderScope(child: EWasteApp()));
}

class EWasteApp extends ConsumerWidget {
  const EWasteApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return MaterialApp.router(
      title: AppConstants.appName,
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ref.watch(themeModeProvider),
      routerConfig: ref.watch(routerProvider),
      builder: (context, child) {
        final dark = Theme.of(context).brightness == Brightness.dark;
        // Transparent system bars with icons that stay readable on the page behind them.
        final bars = SystemUiOverlayStyle(
          statusBarColor: Colors.transparent,
          systemNavigationBarColor: Colors.transparent,
          systemNavigationBarContrastEnforced: false,
          statusBarIconBrightness: dark ? Brightness.light : Brightness.dark,
          systemNavigationBarIconBrightness: dark ? Brightness.light : Brightness.dark,
        );
        return AnnotatedRegion<SystemUiOverlayStyle>(value: bars, child: SavedDataBanner(child: child ?? const SizedBox.shrink()));
      },
    );
  }
}
