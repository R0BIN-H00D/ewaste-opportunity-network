import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../providers/auth_controller.dart';
import '../routes/app_router.dart';
import '../widgets/app_background.dart';
import '../widgets/glass_container.dart';

class _Page {
  const _Page(this.icon, this.title, this.body);

  final IconData icon;
  final String title;
  final String body;
}

const _pages = [
  _Page(Icons.devices_other_outlined, 'Old devices still have value', 'List a laptop, phone or monitor in a minute. Choose to repair, donate, refurbish or recycle it.'),
  _Page(Icons.handyman_outlined, 'Find help you can trust', 'Verified technicians, refurbishers and recycling centres near you. Handovers are checked, and you never pay through the app.'),
  _Page(Icons.eco_outlined, 'See what you saved', 'Every completed service adds to your environmental impact. Only verified results count.'),
];

/// Shown once, the first time the app is opened. Skippable.
class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _controller = PageController();
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    await ref.read(onboardingProvider.notifier).complete();
    if (mounted) context.go(Routes.login);
  }

  void _next() {
    if (_page == _pages.length - 1) {
      _finish();
    } else {
      _controller.nextPage(duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final last = _page == _pages.length - 1;
    return Scaffold(
      body: AppBackground(
        child: SafeArea(
          child: Column(
            children: [
              Align(
                alignment: Alignment.centerRight,
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(8, 8, 16, 0),
                  child: TextButton(onPressed: _finish, child: const Text('Skip')),
                ),
              ),
              Expanded(
                child: PageView.builder(
                  controller: _controller,
                  itemCount: _pages.length,
                  onPageChanged: (i) => setState(() => _page = i),
                  itemBuilder: (_, i) {
                    final page = _pages[i];
                    return Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Center(
                        child: GlassContainer(
                          padding: const EdgeInsets.all(28),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(page.icon, size: 64, color: theme.colorScheme.primary),
                              const SizedBox(height: 20),
                              Semantics(header: true, child: Text(page.title, style: theme.textTheme.headlineMedium, textAlign: TextAlign.center)),
                              const SizedBox(height: 12),
                              Text(page.body, style: theme.textTheme.bodyLarge, textAlign: TextAlign.center),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
              Semantics(
                label: 'Page ${_page + 1} of ${_pages.length}',
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    for (var i = 0; i < _pages.length; i++)
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        margin: const EdgeInsets.symmetric(horizontal: 4),
                        width: i == _page ? 24 : 8,
                        height: 8,
                        decoration: BoxDecoration(
                          color: i == _page ? theme.colorScheme.primary : theme.colorScheme.onSurface.withValues(alpha: 0.25),
                          borderRadius: BorderRadius.circular(4),
                        ),
                      ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(24, 20, 24, 24),
                child: SizedBox(
                  width: double.infinity,
                  child: FilledButton(onPressed: _next, child: Text(last ? 'Get started' : 'Next')),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
