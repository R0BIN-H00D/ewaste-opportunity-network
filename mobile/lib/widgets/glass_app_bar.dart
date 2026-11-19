import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

/// A see-through app bar with a back arrow, for full-screen pages above the floating bottom bar. Sets the status bar
/// icons dark on the light theme and light on the dark one, so the clock and battery stay readable.
PreferredSizeWidget glassAppBar(
  BuildContext context,
  String title, {
  List<Widget> actions = const [],
  bool automaticallyImplyLeading = true,
}) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  return AppBar(
    title: Text(title),
    actions: actions,
    automaticallyImplyLeading: automaticallyImplyLeading,
    backgroundColor: Colors.transparent,
    elevation: 0,
    systemOverlayStyle: dark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark,
  );
}
