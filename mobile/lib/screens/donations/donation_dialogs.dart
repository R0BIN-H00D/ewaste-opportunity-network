import 'package:material_ui/material_ui.dart';
import '../../core/donation_validation.dart';

/// What a recipient typed when asking for a device.
class DonationAsk {
  const DonationAsk({required this.justification, this.intendedUse = ''});

  final String justification;
  final String intendedUse;
}

/// The request form: why the organisation needs the device and, optionally, what it will be used for. `null` if they back out.
Future<DonationAsk?> askDonation(BuildContext context, {required String title}) {
  return showModalBottomSheet<DonationAsk>(
    context: context,
    isScrollControlled: true,
    showDragHandle: true,
    builder: (ctx) => _AskSheet(title: title),
  );
}

class _AskSheet extends StatefulWidget {
  const _AskSheet({required this.title});

  final String title;

  @override
  State<_AskSheet> createState() => _AskSheetState();
}

class _AskSheetState extends State<_AskSheet> {
  final _formKey = GlobalKey<FormState>();
  final _why = TextEditingController();
  final _use = TextEditingController();

  @override
  void dispose() {
    _why.dispose();
    _use.dispose();
    super.dispose();
  }

  void _send() {
    if (!_formKey.currentState!.validate()) return;
    Navigator.pop(context, DonationAsk(justification: _why.text.trim(), intendedUse: _use.text.trim()));
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: EdgeInsets.fromLTRB(20, 0, 20, 20 + MediaQuery.viewInsetsOf(context).bottom),
      child: Form(
        key: _formKey,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Ask for this device', style: theme.textTheme.titleLarge),
              Text(widget.title, style: theme.textTheme.bodyMedium),
              const SizedBox(height: 12),
              TextFormField(
                controller: _why,
                validator: validateJustification,
                maxLines: 4,
                maxLength: 1000,
                decoration: const InputDecoration(labelText: 'Why do you need it?'),
              ),
              const SizedBox(height: 8),
              TextFormField(
                controller: _use,
                validator: validateIntendedUse,
                maxLines: 2,
                maxLength: 500,
                decoration: const InputDecoration(labelText: 'What will it be used for? (optional)'),
              ),
              const SizedBox(height: 8),
              FilledButton(onPressed: _send, style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(48)), child: const Text('Send request')),
            ],
          ),
        ),
      ),
    );
  }
}
