import 'package:flutter/foundation.dart';
import 'package:material_ui/material_ui.dart';
import '../core/constants/app_constants.dart';
import 'app_background.dart';
import 'brand_mark.dart';
import 'glass_container.dart';

/// The frame of every signed-out screen: gradient, brand mark, a title and the form inside one glass card.
/// Scrolls when the keyboard is open, and keeps its width comfortable on tablets.
class AuthScaffold extends StatelessWidget {
  const AuthScaffold({super.key, required this.title, required this.child, this.subtitle, this.showBack = false});

  final String title;
  final String? subtitle;
  final Widget child;
  final bool showBack;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: showBack ? AppBar(backgroundColor: Colors.transparent, elevation: 0, scrolledUnderElevation: 0) : null,
      extendBodyBehindAppBar: showBack,
      body: AppBackground(
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 20, 20, 32),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 440),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Center(child: BrandMark(size: 64)),
                    const SizedBox(height: 16),
                    Semantics(header: true, child: Text(title, style: theme.textTheme.headlineMedium, textAlign: TextAlign.center)),
                    if (subtitle != null) ...[
                      const SizedBox(height: 6),
                      Text(subtitle!, style: theme.textTheme.bodyMedium, textAlign: TextAlign.center),
                    ],
                    const SizedBox(height: 20),
                    GlassContainer(child: child),
                    // Which server this build talks to, so a wrong address on a phone is easy to spot. Debug builds only.
                    if (kDebugMode) ...[
                      const SizedBox(height: 12),
                      Text('API: ${AppConstants.apiBaseUrl}', style: theme.textTheme.labelSmall, textAlign: TextAlign.center),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
