import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../../providers/listings_controller.dart';
import '../../routes/route_paths.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';
import 'listing_card.dart';

/// The scrolling list behind both Browse and My listings: a header, then skeletons while loading, an error with retry,
/// an empty message, or the cards with more arriving as you reach the end. Pull down to refresh.
class ListingsView extends ConsumerStatefulWidget {
  const ListingsView({
    super.key,
    required this.mine,
    required this.header,
    required this.emptyTitle,
    required this.emptyMessage,
    this.emptyActionLabel,
    this.onEmptyAction,
  });

  final bool mine;
  final Widget header;
  final String emptyTitle;
  final String emptyMessage;
  final String? emptyActionLabel;
  final VoidCallback? onEmptyAction;

  @override
  ConsumerState<ListingsView> createState() => _ListingsViewState();
}

class _ListingsViewState extends ConsumerState<ListingsView> {
  final _scroll = ScrollController();

  @override
  void initState() {
    super.initState();
    _scroll.addListener(_onScroll);
  }

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (!_scroll.hasClients) return;
    if (_scroll.position.extentAfter < 400) ref.read(listingsProvider(widget.mine).notifier).loadMore();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(listingsProvider(widget.mine));
    final notifier = ref.read(listingsProvider(widget.mine).notifier);

    final children = <Widget>[widget.header, const SizedBox(height: 12)];

    if (state.loading && state.items.isEmpty) {
      for (var i = 0; i < 4; i++) {
        children.add(const Padding(padding: EdgeInsets.only(bottom: 12), child: Skeleton(height: 120, radius: 24)));
      }
    } else if (state.error != null && state.items.isEmpty) {
      children.add(ErrorState(error: state.error!, onRetry: notifier.load));
    } else if (state.loaded && state.items.isEmpty) {
      children.add(EmptyState(
        icon: Icons.search_off_outlined,
        title: widget.emptyTitle,
        message: widget.emptyMessage,
        actionLabel: widget.emptyActionLabel,
        onAction: widget.onEmptyAction,
      ));
    } else {
      for (final listing in state.items) {
        children.add(Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: ListingCard(listing: listing, onTap: () => context.push(Routes.listing(listing.id))),
        ));
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
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 110), // room for the floating bar
        children: children,
      ),
    );
  }
}
