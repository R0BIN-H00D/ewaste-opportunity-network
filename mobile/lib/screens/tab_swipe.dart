import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';

/// Swipe between tabs, or tap a tab to switch directly.
/// Each tab keeps its scroll position and state.
class TabSwipeContainer extends StatefulWidget {
  const TabSwipeContainer({super.key, required this.navigationShell, required this.children});

  final StatefulNavigationShell navigationShell;

  /// One page for each tab, in the order of the tabs.
  final List<Widget> children;

  @override
  State<TabSwipeContainer> createState() => _TabSwipeContainerState();
}

class _TabSwipeContainerState extends State<TabSwipeContainer> {
  late final PageController _controller = PageController(initialPage: widget.navigationShell.currentIndex);

  /// True while the page is being moved by the bar rather than by a finger, so that move is not taken for a swipe.
  bool _fromBar = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  void didUpdateWidget(TabSwipeContainer oldWidget) {
    super.didUpdateWidget(oldWidget);
    final wanted = widget.navigationShell.currentIndex;
    // A tab was tapped in the bar: show it at once. (After the frame, because pages must not move while the tree is building.)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_controller.hasClients) return;
      if ((_controller.page ?? wanted.toDouble()).round() == wanted) return;
      _fromBar = true;
      _controller.jumpToPage(wanted);
      _fromBar = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return ScrollConfiguration(
      // No glow or stretch at the ends: a swipe that has nowhere to go does nothing at all.
      behavior: ScrollConfiguration.of(context).copyWith(overscroll: false),
      child: PageView(
        controller: _controller,
        physics: const PageScrollPhysics(parent: ClampingScrollPhysics()),
        onPageChanged: (index) {
          if (_fromBar) return;
          if (index != widget.navigationShell.currentIndex) widget.navigationShell.goBranch(index);
        },
        children: [for (final page in widget.children) _KeepAlive(child: page)],
      ),
    );
  }
}

/// Keeps a tab built while it is off screen, so it is not rebuilt (and does not lose its place) when it comes back.
class _KeepAlive extends StatefulWidget {
  const _KeepAlive({required this.child});

  final Widget child;

  @override
  State<_KeepAlive> createState() => _KeepAliveState();
}

class _KeepAliveState extends State<_KeepAlive> with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    return widget.child;
  }
}
