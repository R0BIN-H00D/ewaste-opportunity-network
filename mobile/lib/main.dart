import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import 'core/constants/app_constants.dart';
import 'core/theme/app_theme.dart';
import 'providers/account_providers.dart';
import 'routes/app_router.dart';
import 'widgets/saved_data_banner.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
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
      builder: (context, child) => SavedDataBanner(child: child ?? const SizedBox.shrink()),
    );
  }
}
