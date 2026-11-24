import 'package:flutter/material.dart';
import 'package:immich_ui/extensions/build_context_extensions.dart';

class SettingsCard extends StatelessWidget {
  const SettingsCard({super.key, required this.icon, required this.title, required this.subtitle, required this.onTap});

  final IconData icon;
  final String title;
  final String subtitle;
  final Function() onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = context.colorScheme;
    return DecoratedBox(
      decoration: BoxDecoration(
        color: scheme.surface,
        border: Border(bottom: BorderSide(color: scheme.outlineVariant, width: 1)),
      ),
      child: ListTile(
        dense: true,
        visualDensity: const VisualDensity(vertical: -1),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 4.0),
        leading: Icon(icon, size: 20, color: scheme.onSurface),
        title: Text(
          title,
          style: context.textTheme.titleSmall?.copyWith(color: scheme.onSurface, fontWeight: FontWeight.w600),
        ),
        subtitle: Text(
          subtitle,
          maxLines: 2,
          overflow: TextOverflow.ellipsis,
          style: context.textTheme.bodySmall?.copyWith(color: scheme.onSurfaceVariant),
        ),
        trailing: Icon(Icons.chevron_right_rounded, size: 18, color: scheme.onSurfaceVariant),
        onTap: onTap,
      ),
    );
  }
}
