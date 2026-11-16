import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../providers/core_providers.dart';
import 'message_banner.dart';

/// Wraps the whole app. While a list on screen comes from what the phone saved (the server could not be reached), a notice at the
/// top says so and says when the data was saved. It goes away as soon as the server answers again.
class SavedDataBanner extends ConsumerWidget {
  const SavedDataBanner({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final since = ref.watch(savedDataSinceProvider);
    // The same widgets in the same places whether or not the notice shows, so the app below (its screens and where you are in them)
    // is never rebuilt from scratch when the notice appears or goes.
    return Column(
      children: [
        since == null
            ? const SizedBox.shrink()
            : Material(
            color: Theme.of(context).colorScheme.surface,
            child: SafeArea(
              bottom: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(12, 8, 12, 8),
                child: MessageBanner(message: 'No connection. Showing what was saved at ${formatSavedAt(since)}.', tone: BannerTone.warning),
              ),
            ),
          ),
        Expanded(child: MediaQuery.removePadding(context: context, removeTop: since != null, child: child)),
      ],
    );
  }
}
