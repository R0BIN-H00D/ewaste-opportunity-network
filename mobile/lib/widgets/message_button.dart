import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../core/network/api_exception.dart';
import '../providers/chat_providers.dart';
import '../routes/route_paths.dart';

/// A "Message" button for a repair, order, donation, recycling request, refurbishment offer or listing. It asks the server
/// for the thread (which works out who the other person is, so nobody can message a stranger) and opens it.
class MessageButton extends ConsumerStatefulWidget {
  const MessageButton({super.key, required this.contextType, required this.contextId, this.label = 'Message'});

  /// One of `service`, `order`, `recycling`, `donation`, `offer`, `enquiry`.
  final String contextType;
  final String contextId;
  final String label;

  @override
  ConsumerState<MessageButton> createState() => _MessageButtonState();
}

class _MessageButtonState extends ConsumerState<MessageButton> {
  bool _busy = false;

  Future<void> _open() async {
    setState(() => _busy = true);
    try {
      final conversation = await ref.read(chatRepositoryProvider).open(widget.contextType, widget.contextId);
      if (!mounted) return;
      await context.push(Routes.message(conversation.id), extra: conversation);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => OutlinedButton.icon(
        onPressed: _busy ? null : _open,
        icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.chat_bubble_outline),
        label: Text(widget.label),
        style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
      );
}
