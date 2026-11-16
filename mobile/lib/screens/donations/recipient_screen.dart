import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/donation_validation.dart';
import '../../core/format.dart';
import '../../core/network/api_exception.dart';
import '../../models/donation.dart';
import '../../providers/donation_providers.dart';
import '../../widgets/app_background.dart';
import '../../widgets/app_chip.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/loading_button.dart';
import '../../widgets/message_banner.dart';
import '../../widgets/skeleton.dart';
import '../../widgets/state_views.dart';

BadgeTone recipientTone(String status) {
  switch (status) {
    case 'approved':
      return BadgeTone.green;
    case 'pending':
      return BadgeTone.blue;
    case 'rejected':
      return BadgeTone.red;
    default:
      return BadgeTone.amber;
  }
}

const Map<String, String> recipientStatusLabels = {
  'not_submitted': 'Not registered',
  'pending': 'Waiting for review',
  'approved': 'Verified',
  'rejected': 'Not approved',
  'resubmission_required': 'Needs more information',
};

/// Register an organisation so it can ask for donated devices. An administrator reviews it.
class RecipientScreen extends ConsumerWidget {
  const RecipientScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref.watch(recipientStatusProvider);
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Your organisation'),
      body: AppBackground(
        child: SafeArea(
          child: status.when(
            loading: () => ListView(padding: const EdgeInsets.all(20), children: const [Skeleton(height: 120, radius: 24), SizedBox(height: 16), Skeleton(height: 200, radius: 24)]),
            error: (e, _) => ListView(padding: const EdgeInsets.all(20), children: [ErrorState(error: ApiException.from(e), onRetry: () => ref.invalidate(recipientStatusProvider))]),
            data: (s) => _Body(status: s),
          ),
        ),
      ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.status});

  final RecipientStatus status;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _name = TextEditingController(text: widget.status.orgName ?? '');
  late final TextEditingController _reg = TextEditingController(text: widget.status.registrationNo ?? '');
  late String _type = widget.status.orgType ?? 'school';
  bool _sending = false;
  String? _banner;
  Map<String, String> _serverErrors = const {};

  @override
  void dispose() {
    _name.dispose();
    _reg.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    setState(() => _serverErrors = const {});
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _sending = true;
      _banner = null;
    });
    try {
      await ref.read(donationRepositoryProvider).applyAsRecipient(orgType: _type, orgName: _name.text, registrationNo: _reg.text);
      ref.invalidate(recipientStatusProvider);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Your organisation was sent for verification')));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _serverErrors = e.fieldErrors;
        _banner = e.fieldErrors.isEmpty ? e.message : null;
      });
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final s = widget.status;
    final locked = s.isApproved || s.isPending;
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 40),
      children: [
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(child: Semantics(header: true, child: Text('Receiving donations', style: theme.textTheme.titleLarge))),
                  StatusBadge(labelOf(recipientStatusPairs, s.status), tone: recipientTone(s.status)),
                ],
              ),
              const SizedBox(height: 8),
              Text(
                s.isApproved
                    ? 'Your organisation is verified. You can ask for devices on the Donations page.'
                    : s.isPending
                        ? 'An administrator is checking your details. You will be told when it is done.'
                        : 'Schools, colleges, NGOs and other registered organisations can ask for donated devices once an administrator has verified them.',
                style: theme.textTheme.bodyLarge,
              ),
              if ((s.reason ?? '').trim().isNotEmpty && !s.isApproved) ...[const SizedBox(height: 12), MessageBanner(message: 'Reason: ${s.reason!.trim()}', tone: BannerTone.warning)],
            ],
          ),
        ),
        const SizedBox(height: 16),
        GlassContainer(
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Semantics(header: true, child: Text(locked ? 'Your details' : 'Register your organisation', style: theme.textTheme.titleLarge)),
                const SizedBox(height: 12),
                Text('Kind of organisation', style: theme.textTheme.titleSmall),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: [for (final (value, label) in orgTypes) AppChip(label: label, selected: _type == value, onTap: locked ? () {} : () => setState(() => _type = value))],
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _name,
                  enabled: !locked,
                  validator: validateOrgName,
                  decoration: InputDecoration(labelText: 'Organisation name', errorText: _serverErrors['orgName']),
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _reg,
                  enabled: !locked,
                  validator: validateRegistrationNo,
                  decoration: InputDecoration(labelText: 'Registration number', errorText: _serverErrors['registrationNo']),
                ),
                if (_banner != null) ...[const SizedBox(height: 12), MessageBanner(message: _banner!, tone: BannerTone.error)],
                if (!locked) ...[
                  const SizedBox(height: 16),
                  LoadingButton(label: s.status == 'not_submitted' ? 'Send for verification' : 'Send again', icon: Icons.send_outlined, loading: _sending, onPressed: _sending ? null : _send),
                ],
              ],
            ),
          ),
        ),
      ],
    );
  }
}

final LabelPairs recipientStatusPairs = [for (final e in recipientStatusLabels.entries) (e.key, e.value)];
