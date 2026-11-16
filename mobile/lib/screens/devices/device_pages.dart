import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../routes/route_paths.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
import 'browse_screen.dart';
import 'my_listings_screen.dart';

/// Full-screen pages (above the bottom bar) that hold the device lists, each with a back arrow.
class _ListPage extends StatelessWidget {
  const _ListPage({required this.title, required this.child, this.floating});

  final String title;
  final Widget child;
  final Widget? floating;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, title),
      floatingActionButton: floating,
      body: AppBackground(child: SafeArea(child: child)),
    );
  }
}

class BrowsePage extends StatelessWidget {
  const BrowsePage({super.key});

  @override
  Widget build(BuildContext context) => const _ListPage(title: 'Browse devices', child: BrowseScreen());
}

class MyListingsPage extends StatelessWidget {
  const MyListingsPage({super.key});

  @override
  Widget build(BuildContext context) => _ListPage(
        title: 'My listings',
        floating: FloatingActionButton.extended(
          onPressed: () => context.push(Routes.newListing),
          icon: const Icon(Icons.add_a_photo_outlined),
          label: const Text('List a device'),
        ),
        child: const MyListingsScreen(),
      );
}
