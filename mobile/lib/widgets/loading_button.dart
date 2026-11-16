import 'package:material_ui/material_ui.dart';

/// The main button of a form. While [loading] it shows a spinner and ignores taps, so a form cannot be sent twice.
class LoadingButton extends StatelessWidget {
  const LoadingButton({super.key, required this.label, required this.onPressed, this.loading = false, this.icon});

  final String label;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final child = loading
        ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2.5))
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (icon != null) ...[Icon(icon, size: 18), const SizedBox(width: 8)],
              Flexible(child: Text(label, textAlign: TextAlign.center)),
            ],
          );
    return Semantics(
      button: true,
      label: loading ? '$label, please wait' : label,
      excludeSemantics: true,
      child: FilledButton(onPressed: loading ? null : onPressed, child: child),
    );
  }
}
