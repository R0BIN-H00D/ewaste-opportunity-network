import 'dart:async';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'auth_controller.dart';
import 'chat_providers.dart';
import 'core_providers.dart';

/// How long to gather a burst of changes before refreshing, so ten quick changes cause one refresh, not ten.
const liveDelay = Duration(milliseconds: 800);

/// The delay in use; tests shorten it.
final liveDelayProvider = Provider<Duration>((ref) => liveDelay);

/// A counter that goes up whenever something the person can see has changed on the server, or the live connection has come
/// back after a gap, or the app has come back to the front after changes arrived in the background. Lists listen to it and
/// fetch again ([PagedNotifier]); everything else is refreshed by [LiveRefreshObserver]. Nothing here reads data itself.
class LiveTick extends Notifier<int> {
  Timer? _timer;
  bool _pending = false; // something changed while the app was in the background
  bool _hadConnection = false;

  @override
  int build() {
    final live = ref.watch(realtimeServiceProvider);
    final subs = [
      live.changes.listen((_) => _schedule()),
      // Only a RE-connection means something may have been missed; the first one comes with every screen's own first fetch.
      live.connection.listen((up) {
        if (up && _hadConnection) _schedule();
        if (up) _hadConnection = true;
      }),
    ];
    final lifecycle = AppLifecycleListener(onResume: () {
      if (_pending) {
        _pending = false;
        _schedule();
      }
    });
    ref.onDispose(() {
      for (final s in subs) {
        s.cancel();
      }
      lifecycle.dispose();
      _timer?.cancel();
    });
    return 0;
  }

  void _schedule() {
    _timer ??= Timer(ref.read(liveDelayProvider), _fire);
  }

  void _fire() {
    _timer = null;
    final lifecycle = WidgetsBinding.instance.lifecycleState;
    if (lifecycle != null && lifecycle != AppLifecycleState.resumed) {
      _pending = true; // wait until the app is back in front; a phone in a pocket should not fetch
      return;
    }
    state = state + 1;
  }
}

final liveTickProvider = NotifierProvider<LiveTick, int>(LiveTick.new);

/// Refreshes every screen's data when [liveTickProvider] ticks, without each provider having to ask for it. It remembers the
/// providers that hold fetched data (anything that is an [AsyncValue]) and invalidates them; Riverpod then fetches again
/// while the screen keeps showing what it has, so nothing flashes. Register it once, on the app's `ProviderScope`.
class LiveRefreshObserver extends ProviderObserver {
  final _active = <ProviderBase<Object?>>{};
  bool _listening = false;

  /// Providers that must not be refetched on a change: they are not data, or are checked once at start-up.
  static final _skip = <ProviderBase<Object?>>{bootProvider, healthProvider};

  @override
  void didAddProvider(ProviderBase<Object?> provider, Object? value, ProviderContainer container) {
    if (value is AsyncValue && !_skip.contains(provider)) _active.add(provider);
    if (_listening) return;
    _listening = true;
    // Not inside this callback: a provider must not be created while another is still being created.
    Future.microtask(() => container.listen<int>(liveTickProvider, (_, __) => refreshAll(container)));
  }

  @override
  void didDisposeProvider(ProviderBase<Object?> provider, ProviderContainer container) {
    _active.remove(provider);
  }

  /// Invalidates everything that holds fetched data. Public for tests.
  void refreshAll(ProviderContainer container) {
    for (final p in List.of(_active)) {
      container.invalidate(p);
    }
  }

  int get trackedCount => _active.length;
}