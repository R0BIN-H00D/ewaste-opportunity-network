import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../providers/paged.dart';
import 'skeleton.dart';
import 'state_views.dart';

/// A scrolling, pull-to-refresh list for any [PagedNotifier]: a header, then skeletons while loading, an error with retry,
/// an empty message, or the items with more arriving as the end comes into view.
class PagedList<T> extends ConsumerStatefulWidget {
  const PagedList({
    super.key,
    required this.provider,
    required this.header,
    required this.itemBuilder,
    required this.emptyTitle,
    required this.emptyMessage,
    this.emptyIcon = Icons.search_off_outlined,
    this.emptyActionLabel,
    this.onEmptyAction,
    this.skeletonHeight = 120,
  });

  final NotifierProvider<PagedNotifier<T>, Paged<T>> provider;
  final Widget header;
  final Widget Function(BuildContext context, T item) itemBuilder;
  final String emptyTitle;
  final String emptyMessage;
  final IconData emptyIcon;
  final String? emptyActionLabel;
  final VoidCallback? onEmptyAction;
  final double skeletonHeight;

  @override
  ConsumerState<PagedList<T>> createState() => _PagedListState<T>();
}

class _PagedListState<T> extends ConsumerState<PagedList<T>> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(() {
      if (_scroll.hasClients && _scroll.position.extentAfter < 400) ref.read(widget.provider.notifier).loadMore();
    });
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(widget.provider);
    final notifier = ref.read(widget.provider.notifier);
    final children = <Widget>[widget.header, const SizedBox(height: 12)];

    if (state.loading && state.items.isEmpty) {
      for (var i = 0; i < 4; i++) {
        children.add(Padding(padding: const EdgeInsets.only(bottom: 12), child: Skeleton(height: widget.skeletonHeight, radius: 24)));
      }
    } else if (state.error != null && state.items.isEmpty) {
      children.add(ErrorState(error: state.error!, onRetry: notifier.load));
    } else if (state.loaded && state.items.isEmpty) {
      children.add(EmptyState(icon: widget.emptyIcon, title: widget.emptyTitle, message: widget.emptyMessage, actionLabel: widget.emptyActionLabel, onAction: widget.onEmptyAction));
    } else {
      for (final item in state.items) {
        children.add(Padding(padding: const EdgeInsets.only(bottom: 12), child: widget.itemBuilder(context, item)));
      }
      if (state.loadingMore) {
        children.add(const Padding(padding: EdgeInsets.symmetric(vertical: 12), child: Center(child: CircularProgressIndicator())));
      } else if (state.error != null) {
        children.add(ErrorState(error: state.error!, onRetry: notifier.loadMore, title: 'Could not load more'));
      }
    }

    return RefreshIndicator(
      onRefresh: notifier.load,
      child: ListView(
        controller: _scroll,
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 110),
        children: children,
      ),
    );
  }
}
