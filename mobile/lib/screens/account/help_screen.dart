import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/network/api_exception.dart';
import '../../providers/account_providers.dart';
import '../../providers/auth_controller.dart';
import '../../widgets/app_background.dart';
import '../../widgets/glass_app_bar.dart';
import '../../widgets/glass_container.dart';
import '../../widgets/message_banner.dart';

/// Short answers to the common questions, and a form that reaches the support team by email.
const helpTopics = <(String, String)>[
  (
    'How do I get a device repaired?',
    'List the device with photos, choose "Repair", then find a technician near you and send a request. You approve the quote before any work starts.'
  ),
  (
    'How do I pay?',
    'You pay the technician or seller directly, as agreed in the quote. The app never handles money; it only keeps a record so both of you can see it.'
  ),
  (
    'What should I do before handing a device over?',
    'Back up what you want to keep, sign out of your accounts, remove screen locks, take out SIM and memory cards, and reset the device if it still turns on.'
  ),
  (
    'Who can see my address?',
    'Others see only your area and city. A technician gets the exact address only after accepting your request.'
  ),
  (
    'How are technicians checked?',
    'Technicians, refurbishers and recycling centres are verified by an administrator before they can offer services.'
  ),
  (
    'Can I cancel a request?',
    'Yes, until you approve the quote. If the technician already has your device, they are asked to return it.'
  ),
];

class HelpPage extends ConsumerStatefulWidget {
  const HelpPage({super.key});

  @override
  ConsumerState<HelpPage> createState() => _HelpPageState();
}

class _HelpPageState extends ConsumerState<HelpPage> {
  final _form = GlobalKey<FormState>();
  final _subject = TextEditingController();
  final _message = TextEditingController();
  bool _sending = false;
  String? _error;
  bool _sent = false;

  @override
  void dispose() {
    _subject.dispose();
    _message.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!_form.currentState!.validate()) return;
    final user = ref.read(authControllerProvider).user;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      await ref.read(accountRepositoryProvider).contact(
          name: user?.name ?? '',
          email: user?.email ?? '',
          subject: _subject.text,
          message: _message.text);
      if (!mounted) return;
      setState(() => _sent = true);
      _subject.clear();
      _message.clear();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final email = ref.watch(authControllerProvider).user?.email ?? '';
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: glassAppBar(context, 'Help and support'),
      body: AppBackground(
        child: SafeArea(
          child: ListView(
            padding: const EdgeInsets.all(20),
            children: [
              Semantics(
                  header: true,
                  child: Text('Common questions',
                      style: theme.textTheme.titleLarge)),
              const SizedBox(height: 8),
              GlassContainer(
                padding: EdgeInsets.zero,
                child: Material(
                  type: MaterialType.transparency,
                  child: Column(
                    children: [
                      for (final (q, a) in helpTopics)
                        ExpansionTile(
                          title: Text(q),
                          childrenPadding:
                              const EdgeInsets.fromLTRB(16, 0, 16, 16),
                          expandedAlignment: Alignment.centerLeft,
                          children: [
                            Text(a, style: theme.textTheme.bodyMedium)
                          ],
                        ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Semantics(
                  header: true,
                  child:
                      Text('Write to us', style: theme.textTheme.titleLarge)),
              const SizedBox(height: 8),
              GlassContainer(
                child: Form(
                  key: _form,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text('We answer by email at $email.',
                          style: theme.textTheme.bodyMedium),
                      const SizedBox(height: 12),
                      if (_sent) ...[
                        const MessageBanner(
                            message:
                                'Thank you. Your message is on its way to the support team.',
                            tone: BannerTone.success),
                        const SizedBox(height: 12)
                      ],
                      if (_error != null) ...[
                        MessageBanner(message: _error!, tone: BannerTone.error),
                        const SizedBox(height: 12)
                      ],
                      TextFormField(
                        controller: _subject,
                        maxLength: 120,
                        decoration: const InputDecoration(labelText: 'Subject'),
                        validator: (v) => (v ?? '').trim().length < 3
                            ? 'Enter a subject'
                            : null,
                      ),
                      TextFormField(
                        controller: _message,
                        maxLines: 5,
                        maxLength: 2000,
                        decoration: const InputDecoration(labelText: 'Message'),
                        validator: (v) => (v ?? '').trim().length < 10
                            ? 'Write at least 10 characters'
                            : null,
                      ),
                      const SizedBox(height: 8),
                      FilledButton(
                          onPressed: _sending ? null : _send,
                          child: Text(_sending ? 'Sending…' : 'Send message')),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
