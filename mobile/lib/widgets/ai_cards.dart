import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:material_ui/material_ui.dart';
import '../core/format.dart';
import '../core/network/api_exception.dart';
import '../models/ai_result.dart';
import '../providers/ai_providers.dart';
import '../routes/route_paths.dart';
import '../services/photo_picker.dart';
import 'glass_container.dart';
import 'message_banner.dart';

String _range(PriceRange r) => '${formatPrice(r.min)} to ${formatPrice(r.max)}';

/// What the AI (or the rules) found: the best next step, why, likely problems, skills and rough prices.
class AiAdviceView extends StatelessWidget {
  const AiAdviceView({super.key, required this.result});

  final AiResult result;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final others = result.alternatives.map((a) => labelOf(services, a).toLowerCase()).join(', ');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          ExcludeSemantics(child: Icon(Icons.lightbulb_outline_rounded, size: 20, color: theme.colorScheme.primary)),
          const SizedBox(width: 8),
          Expanded(
            child: Text.rich(TextSpan(children: [
              TextSpan(text: 'Best next step: ${labelOf(services, result.recommendation)}', style: theme.textTheme.titleMedium),
              if (others.isNotEmpty) TextSpan(text: ' (or $others)', style: theme.textTheme.bodyMedium),
            ])),
          ),
        ]),
        for (final r in result.reasons) Padding(padding: const EdgeInsets.only(top: 6), child: Text('• $r', style: theme.textTheme.bodyLarge)),
        if (result.problems.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Likely problems: ${result.problems.join(', ')}.', style: theme.textTheme.bodyLarge)),
        if (result.skills.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 6), child: Text('A technician should know: ${result.skills.join(', ')}.', style: theme.textTheme.bodyLarge)),
        if (result.resale != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text('Worth about ${_range(result.resale!)}', style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600))),
        if (result.repair != null) Text('Repair would cost about ${_range(result.repair!)}', style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600)),
        if (result.safetyTip != null) Padding(padding: const EdgeInsets.only(top: 6), child: Text(result.safetyTip!, style: theme.textTheme.bodyMedium)),
        const SizedBox(height: 8),
        Text(
          '${result.fromAi ? 'Suggested by AI. ' : 'Suggested from simple rules. '}Prices are rough estimates, not offers. ${result.notice}',
          style: theme.textTheme.bodySmall,
        ),
      ],
    );
  }
}

/// "Suggest from my photos": sends the chosen photos (and the words already typed) to the server's free AI, then lets the person
/// fill the form with what it found. Nothing is filled until they press "Use these details".
class AiAssistCard extends ConsumerStatefulWidget {
  const AiAssistCard({super.key, required this.photos, required this.words, required this.onApply});

  final List<PickedPhoto> photos;

  /// The words already typed (name, brand, description), read when the button is pressed.
  final String Function() words;
  final void Function(AiResult result) onApply;

  @override
  ConsumerState<AiAssistCard> createState() => _AiAssistCardState();
}

class _AiAssistCardState extends ConsumerState<AiAssistCard> {
  bool _busy = false;
  String? _error;
  AiResult? _result;

  Future<void> _run(bool photoAi) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await ref.read(aiRepositoryProvider).analyzeDevice(photoAi ? widget.photos : const [], text: widget.words());
      if (mounted) setState(() => _result = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final photoAi = ref.watch(photoAiProvider).valueOrNull ?? false;
    final canRun = widget.photos.isNotEmpty || widget.words().trim().isNotEmpty;
    final r = _result;
    return GlassContainer(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(header: true, child: Row(children: [
            Icon(Icons.auto_awesome_outlined, size: 20, color: theme.colorScheme.primary),
            const SizedBox(width: 8),
            Text('Let AI help fill this in', style: theme.textTheme.titleMedium),
          ])),
          const SizedBox(height: 6),
          Text(
            photoAi
                ? 'Reads your photos with a free AI (Google Gemini) to suggest the brand, model, condition, likely problems and a rough value. Your photos are sent to Google only when you press the button.'
                : 'Photo reading is switched off, so this uses only the words you typed. Add the device name first.',
            style: theme.textTheme.bodyMedium,
          ),
          const SizedBox(height: 10),
          if (_error != null) ...[MessageBanner(message: _error!, tone: BannerTone.error), const SizedBox(height: 10)],
          OutlinedButton.icon(
            onPressed: _busy || !canRun ? null : () => _run(photoAi),
            icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.auto_awesome_outlined),
            label: Text(_busy ? 'Thinking…' : photoAi ? 'Suggest from my photos' : 'Suggest from my words'),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          ),
          if (r != null) ...[
            const Divider(height: 28),
            if (r.unavailableReason != null) ...[MessageBanner(message: r.unavailableReason!, tone: BannerTone.info), const SizedBox(height: 10)],
            Text([r.title ?? 'Device', if (r.categoryName != null) r.categoryName!, if (r.condition != null) labelOf(conditions, r.condition)].join(' · '), style: theme.textTheme.titleMedium),
            const SizedBox(height: 8),
            AiAdviceView(result: r),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: () => widget.onApply(r),
              style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)),
              child: const Text('Use these details'),
            ),
          ],
        ],
      ),
    );
  }
}

/// For the owner of a device: AI advice on what to do with it, and who fits, with the reasons.
class SmartMatchesCard extends ConsumerStatefulWidget {
  const SmartMatchesCard({super.key, required this.listingId, required this.service});

  final String listingId;
  final String service;

  @override
  ConsumerState<SmartMatchesCard> createState() => _SmartMatchesCardState();
}

class _SmartMatchesCardState extends ConsumerState<SmartMatchesCard> {
  bool _busy = false;
  String? _error;
  AiResult? _advice;

  static const _lookups = {
    'repair': [('technicians', 'Technicians who fit this repair')],
    'refurbishment': [('refurbishers', 'Refurbishers near you'), ('wanted', 'Refurbishers asking for a device like this')],
    'recycling': [('recyclers', 'Recycling centres that take this device')],
  };

  Future<void> _ask() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final r = await ref.read(aiRepositoryProvider).adviceFor(widget.listingId);
      if (mounted) setState(() => _advice = r);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final lookups = _lookups[widget.service] ?? const <(String, String)>[];
    return GlassContainer(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Semantics(header: true, child: Row(children: [
            Icon(Icons.auto_awesome_outlined, size: 20, color: theme.colorScheme.primary),
            const SizedBox(width: 8),
            Text('Smart suggestions', style: theme.textTheme.titleLarge),
          ])),
          const SizedBox(height: 12),
          if (_error != null) ...[MessageBanner(message: _error!, tone: BannerTone.error), const SizedBox(height: 10)],
          OutlinedButton.icon(
            onPressed: _busy ? null : _ask,
            icon: _busy ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)) : const Icon(Icons.lightbulb_outline_rounded),
            label: Text(_busy ? 'Thinking…' : 'Repair, refurbish, reuse or recycle?'),
            style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(48)),
          ),
          if (_advice != null) ...[const SizedBox(height: 12), AiAdviceView(result: _advice!)],
          for (final (kind, title) in lookups) ...[
            const SizedBox(height: 18),
            _MatchList(listingId: widget.listingId, kind: kind, title: title),
          ],
        ],
      ),
    );
  }
}

class _MatchList extends ConsumerWidget {
  const _MatchList({required this.listingId, required this.kind, required this.title});

  final String listingId;
  final String kind;
  final String title;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final matches = ref.watch(matchesProvider((listingId: listingId, kind: kind)));
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Semantics(header: true, child: Text(title, style: theme.textTheme.titleMedium)),
        const SizedBox(height: 6),
        matches.when(
          loading: () => const LinearProgressIndicator(),
          error: (e, _) => Text(e is ApiException ? e.message : 'Could not load suggestions.', style: theme.textTheme.bodyMedium),
          data: (list) => list.isEmpty
              ? Text('No one fits yet. New providers join often, so check again later.', style: theme.textTheme.bodyMedium)
              : Column(children: [
                  for (final m in list.take(5))
                    Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Material(
                        type: MaterialType.transparency,
                        child: InkWell(
                          borderRadius: BorderRadius.circular(14),
                          onTap: m.kind == 'technician' ? () => context.push(Routes.technician(m.id, listing: listingId)) : null,
                          child: Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(m.name, style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w700)),
                                  Text(m.reasons.join(' · '), style: theme.textTheme.bodyMedium),
                                ]),
                              ),
                              const SizedBox(width: 8),
                              Semantics(
                                label: 'Match ${m.score.round()} out of 100',
                                child: Text('${m.score.round()}% match', style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary)),
                              ),
                            ]),
                          ),
                        ),
                      ),
                    ),
                ]),
        ),
      ],
    );
  }
}
