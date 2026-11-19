import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/constants/app_constants.dart';
import '../../widgets/brand_mark.dart';

class AppAboutDialog extends StatefulWidget {
  const AppAboutDialog({super.key});

  @override
  State<AppAboutDialog> createState() => _AppAboutDialogState();
}

class _AppAboutDialogState extends State<AppAboutDialog> {
  late final _version = const MethodChannel('ewaste/app_info').invokeMethod<String>('getVersion');

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AlertDialog(
      title: const Text('About'),
      scrollable: true,
      content: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const BrandMark(size: 44),
              const SizedBox(width: 12),
              Expanded(child: Text(AppConstants.appName, style: theme.textTheme.titleMedium)),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            'Give electronics a second life. Connect with people and services that can repair, refurbish, reuse or responsibly recycle your devices.',
            style: theme.textTheme.bodyMedium,
          ),
          const Divider(height: 28),
          Text('Project team', style: theme.textTheme.titleSmall),
          const SizedBox(height: 4),
          Text('ROBIN · VISMAYA · MEGHANA', style: theme.textTheme.bodyMedium),
          const SizedBox(height: 14),
          FutureBuilder<String?>(
            future: _version,
            builder: (context, snapshot) {
              final version = snapshot.data;
              if (version == null || version.isEmpty) return const SizedBox.shrink();
              return Text('Version $version', style: theme.textTheme.labelMedium);
            },
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Close')),
      ],
    );
  }
}
