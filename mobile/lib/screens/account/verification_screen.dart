import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/format.dart';
import '../../core/theme/app_colors.dart';
import '../../core/network/api_exception.dart';
import '../../models/verification.dart';
import '../../providers/auth_controller.dart';
import '../../providers/verification_providers.dart';
import '../../services/photo_picker.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/loading_button.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/photo_attachments.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';

const maxDocumentPhotos = 3;

BadgeTone verificationTone(String status) {
  switch (status) {
    case 'approved':
      return BadgeTone.green;
    case 'pending':
      return BadgeTone.blue;
    case 'rejected':
      return BadgeTone.red;
    case 'resubmission_required':
      return BadgeTone.amber;
    default:
      return BadgeTone.neutral;
  }
}

/// What the status means for the provider, and what to do next.
String verificationExplanation(String status) {
  switch (status) {
    case 'approved':
      return 'You are approved. You can take jobs and offer your services.';
    case 'pending':
      return 'An administrator is checking your documents. You will be told as soon as they decide.';
    case 'rejected':
      return 'Your documents were not approved. Read the reason below and send new ones.';
    case 'resubmission_required':
      return 'An administrator needs more from you. Send the documents they asked for.';
    default:
      return 'Send your documents to be approved. Until then you cannot offer services.';
  }
}

/// A provider's approval: where it stands, the documents sent, and a way to send more (photographed with the camera or chosen from the gallery).
class VerificationScreen extends ConsumerStatefulWidget {
  const VerificationScreen({super.key});

  @override
  ConsumerState<VerificationScreen> createState() => _VerificationScreenState();
}

class _VerificationScreenState extends ConsumerState<VerificationScreen> {
  String? _docType;
  List<PickedPhoto> _photos = const [];
  double? _progress;
  String? _error;
  String? _success;

  bool get _sending => _progress != null;

  Future<void> _refresh() async {
    ref.invalidate(verificationStatusProvider);
    await ref.read(authControllerProvider.notifier).reload(); // the notice on the home screen follows
  }

  Future<void> _submit() async {
    final type = _docType;
    if (type == null || _photos.isEmpty) return;
    setState(() {
      _progress = 0;
      _error = null;
      _success = null;
    });
    try {
      await ref.read(verificationRepositoryProvider).submit(type, _photos, onProgress: (p) {
        if (mounted) setState(() => _progress = p);
      });
      await _refresh();
      if (!mounted) return;
      setState(() {
        _progress = null;
        _photos = const [];
        _success = 'Sent. An administrator will check it.';
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _progress = null;
        _error = e.fieldErrors.values.isNotEmpty ? e.fieldErrors.values.first : e.message;
      });
    }
  }

  Future<void> _remove(VerificationDoc doc) async {
    final yes = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove this document?'),
        content: Text('${docTypeLabels[doc.docType] ?? doc.docType}${doc.fileName == null ? '' : ' (${doc.fileName})'} will be deleted.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Keep it')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Remove')),
        ],
      ),
    );
    if (yes != true) return;
    try {
      await ref.read(verificationRepositoryProvider).remove(doc.id);
      await _refresh();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = ref.watch(verificationStatusProvider);
    return status.when(
      loading: () => ListView(padding: const EdgeInsets.all(20), children: const [Skeleton(height: 120, radius: 24), SizedBox(height: 16), Skeleton(height: 160, radius: 24)]),
      error: (e, _) => ListView(
        padding: const EdgeInsets.all(20),
        children: [
          ErrorState(
            error: ApiException.from(e),
            title: ApiException.from(e).failure == ApiFailure.forbidden ? 'Only providers send documents' : null,
            onRetry: () => ref.invalidate(verificationStatusProvider),
          ),
        ],
      ),
      data: (v) => RefreshIndicator(onRefresh: _refresh, child: _body(context, v)),
    );
  }

  Color _toneColor(String status) => AppColors.adapt(context, _toneBase(status));

  Color _toneBase(String status) {
    switch (verificationTone(status)) {
      case BadgeTone.green:
        return AppColors.success;
      case BadgeTone.blue:
        return AppColors.info;
      case BadgeTone.red:
        return AppColors.danger;
      case BadgeTone.amber:
        return AppColors.warning;
      case BadgeTone.neutral:
        return Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.6);
    }
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'approved':
        return Icons.verified_rounded;
      case 'pending':
        return Icons.hourglass_top_rounded;
      case 'rejected':
        return Icons.block_rounded;
      case 'resubmission_required':
        return Icons.edit_note_rounded;
      default:
        return Icons.upload_file_outlined;
    }
  }

  Widget _title(ThemeData theme, IconData icon, String text) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(
          children: [
            Icon(icon, size: 20, color: theme.colorScheme.primary),
            const SizedBox(width: 8),
            Expanded(child: Semantics(header: true, child: Text(text, style: theme.textTheme.titleMedium))),
          ],
        ),
      );

  Widget _body(BuildContext context, VerificationStatus v) {
    final theme = Theme.of(context);
    final reason = v.reason?.trim() ?? '';
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      children: [
        if (ref.watch(authControllerProvider.select((auth) => auth.me?.isLocked ?? false))) ...[
          const MessageBanner(
            message: 'Verify your account to unlock the rest of the app. Until then only your profile, account and help are open.',
            tone: BannerTone.info,
          ),
          const SizedBox(height: 16),
        ],
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  ExcludeSemantics(
                    child: Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(color: _toneColor(v.status).withValues(alpha: 0.14), borderRadius: BorderRadius.circular(15)),
                      child: Icon(_statusIcon(v.status), size: 24, color: _toneColor(v.status)),
                    ),
                  ),
                  const SizedBox(width: 12),
                  Expanded(child: Semantics(header: true, child: Text('Your approval', style: theme.textTheme.titleLarge))),
                  StatusBadge(verificationLabels[v.status] ?? v.status, tone: verificationTone(v.status)),
                ],
              ),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(color: _toneColor(v.status).withValues(alpha: 0.09), borderRadius: BorderRadius.circular(16)),
                child: Text(verificationExplanation(v.status), style: theme.textTheme.bodyLarge?.copyWith(fontSize: 14.5)),
              ),
              if (reason.isNotEmpty && (v.status == 'rejected' || v.status == 'resubmission_required')) ...[
                const SizedBox(height: 12),
                MessageBanner(message: 'Reason: $reason', tone: BannerTone.warning),
              ],
            ],
          ),
        ),
        if (v.documents.isNotEmpty) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _title(theme, Icons.folder_copy_outlined, 'Documents you sent'),
                for (final doc in v.documents) _DocRow(doc: doc, onRemove: doc.isApproved ? null : () => _remove(doc)),
              ],
            ),
          ),
        ],
        if (v.canAddDocuments) ...[
          const SizedBox(height: 16),
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _title(theme, Icons.upload_file_outlined, v.documents.isEmpty ? 'Send documents' : 'Send more documents'),
                Text('What kind of document?', style: theme.textTheme.titleSmall),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [
                    for (final type in v.allowedDocTypes)
                      AppChip(label: docTypeLabels[type] ?? type, selected: _docType == type, onTap: _sending ? () {} : () => setState(() => _docType = type)),
                  ],
                ),
                const SizedBox(height: 16),
                PhotoAttachments(photos: _photos, max: maxDocumentPhotos, label: 'Photos of the document', onChanged: (p) => setState(() => _photos = p)),
                const SizedBox(height: 8),
                Text('Photograph it flat, in good light, with all four corners showing. Only administrators can see your documents.', style: theme.textTheme.bodyMedium),
                if (_error != null) ...[const SizedBox(height: 12), MessageBanner(message: _error!, tone: BannerTone.error)],
                if (_success != null) ...[const SizedBox(height: 12), MessageBanner(message: _success!, tone: BannerTone.success)],
                if (_sending) ...[const SizedBox(height: 12), LinearProgressIndicator(value: _progress == 0 ? null : _progress)],
                const SizedBox(height: 16),
                LoadingButton(
                  label: 'Send for approval',
                  icon: Icons.upload_file_outlined,
                  loading: _sending,
                  onPressed: _docType == null || _photos.isEmpty ? null : _submit,
                ),
                if (_docType == null || _photos.isEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(_docType == null ? 'Choose the kind of document first.' : 'Add at least one photo.', style: theme.textTheme.bodyMedium),
                  ),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

class _DocRow extends StatelessWidget {
  const _DocRow({required this.doc, required this.onRemove});

  final VerificationDoc doc;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = doc.status == 'approved' ? BadgeTone.green : (doc.status == 'rejected' ? BadgeTone.red : BadgeTone.blue);
    final label = doc.status == 'approved' ? 'Approved' : (doc.status == 'rejected' ? 'Not accepted' : 'Waiting');
    final reason = doc.reason?.trim() ?? '';
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.fromLTRB(12, 12, 4, 12),
      decoration: BoxDecoration(border: Border.all(color: theme.colorScheme.outlineVariant), borderRadius: BorderRadius.circular(16)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ExcludeSemantics(child: Container(width: 40, height: 40, decoration: BoxDecoration(color: theme.colorScheme.primary.withValues(alpha: 0.10), borderRadius: BorderRadius.circular(12)), child: Icon(Icons.description_outlined, size: 21, color: theme.colorScheme.primary))),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(docTypeLabels[doc.docType] ?? doc.docType, style: theme.textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600)),
                if (doc.fileName != null) Text(doc.fileName!, style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12), maxLines: 1, overflow: TextOverflow.ellipsis),
                if (doc.submittedAt != null) Text('Sent ${formatDate(doc.submittedAt)}', style: theme.textTheme.bodyMedium?.copyWith(fontSize: 12)),
                const SizedBox(height: 4),
                StatusBadge(label, tone: tone),
                if (reason.isNotEmpty) Padding(padding: const EdgeInsets.only(top: 4), child: Text(reason, style: theme.textTheme.bodyMedium)),
              ],
            ),
          ),
          if (onRemove != null)
            IconButton(
              tooltip: 'Remove ${docTypeLabels[doc.docType] ?? doc.docType}',
              constraints: const BoxConstraints(minWidth: 48, minHeight: 48),
              icon: const Icon(Icons.delete_outline),
              onPressed: onRemove,
            ),
        ],
      ),
    );
  }
}

class VerificationPage extends StatelessWidget {
  const VerificationPage({super.key});

  @override
  Widget build(BuildContext context) => Scaffold(
        extendBodyBehindAppBar: true,
        appBar: glassAppBar(context, 'Verification'),
        body: const AppBackground(child: SafeArea(child: VerificationScreen())),
      );
}
