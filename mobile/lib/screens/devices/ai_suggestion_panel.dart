import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/network/api_exception.dart';
import '../../models/ai_suggestion.dart';
import '../../providers/ai_providers.dart';
import '../../services/photo_picker.dart';
import '../../widgets/glass_container.dart';

/// "Suggest what this is" on the listing form (FR-AI-001..004). It asks the server, shows what came back with a plain warning
/// that a photo cannot show internal damage, and only fills the form in when the person taps "Use this" (FR-AI-002).
class AiSuggestionPanel extends ConsumerStatefulWidget {
  const AiSuggestionPanel({super.key, required this.title, required this.description, required this.photo, required this.onUse});

  /// Read when the button is tapped, so the latest typing is what is sent.
  final String Function() title;
  final String Function() description;
  final PickedPhoto? Function() photo;

  /// The person accepted the suggestion.
  final void Function(AiSuggestion suggestion) onUse;

  @override
  ConsumerState<AiSuggestionPanel> createState() => _AiSuggestionPanelState();
}

class _AiSuggestionPanelState extends ConsumerState<AiSuggestionPanel> {
  bool _busy = false;
  AiSuggestion? _suggestion;
  String? _error;
  bool _used = false;

  Future<void> _ask() async {
    final photo = widget.photo();
    if (photo == null && widget.title().trim().length < 2) {
      setState(() => _error = 'Add a photo or type the device name first.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
      _used = false;
    });
    try {
      final s = await ref.read(aiRepositoryProvider).classify(title: widget.title(), description: widget.description(), photo: photo);
      if (mounted) setState(() => _suggestion = s);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = _suggestion;
    return GlassContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(header: true, child: Text('Not sure what to choose?', style: theme.textTheme.titleMedium)),
          const SizedBox(height: 4),
          Text('We can suggest a category from your photo and the words you typed. You decide what to keep.', style: theme.textTheme.bodyMedium),
          const SizedBox(height: 8),
          OutlinedButton.icon(
            onPressed: _busy ? null : _ask,
            icon: _busy ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome_outlined),
            label: Text(_busy ? 'Looking...' : (s == null ? 'Suggest what this is' : 'Suggest again')),
          ),
          if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: theme.colorScheme.error))),
          if (s != null) ...[const SizedBox(height: 12), _result(theme, s)],
        ],
      ),
    );
  }

  Widget _result(ThemeData theme, AiSuggestion s) {
    if (s.isEmpty) {
      return Text('We could not tell what this is. Please choose the category yourself.', style: theme.textTheme.bodyMedium);
    }
    Widget line(String label, String value) => Padding(
          padding: const EdgeInsets.only(bottom: 4),
          child: Text.rich(TextSpan(children: [TextSpan(text: '$label: ', style: const TextStyle(fontWeight: FontWeight.w700)), TextSpan(text: value)])),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(s.usedPhoto ? 'From your photo · ${s.confidenceLabel}' : 'From your words · ${s.confidenceLabel}', style: theme.textTheme.labelLarge),
        const SizedBox(height: 6),
        if (s.categoryName != null) line('Category', s.categoryName!),
        if ((s.brand ?? '').isNotEmpty) line('Brand', s.brand!),
        if (s.visibleDamage.isNotEmpty) line(s.usedPhoto ? 'Damage that looks visible' : 'Damage you mentioned', s.visibleDamage.join(', ')),
        if (s.possibleRepairs.isNotEmpty) line('A repairer might look at', s.possibleRepairs.join(', ')),
        if (s.disclaimer.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4, bottom: 8), child: Text(s.disclaimer, style: theme.textTheme.bodySmall)),
        if (_used)
          Row(children: [const Icon(Icons.check_circle_outline, size: 18), const SizedBox(width: 6), Text('Added to the form. You can still change it.', style: theme.textTheme.bodyMedium)])
        else
          FilledButton(
            onPressed: () {
              widget.onUse(s);
              setState(() => _used = true);
            },
            child: const Text('Use this'),
          ),
      ],
    );
  }
}