import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_hooks/flutter_hooks.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/gallery/theme/kioku_theme.provider.dart';
import 'package:immich_mobile/gallery/theme/kioku_theme_derive.dart';
import 'package:immich_mobile/gallery/theme/kioku_tokens.dart';

/// Opens the searchable 101-theme Omarchy palette picker sheet.
Future<void> showKiokuThemePickerSheet(BuildContext context) async {
  await KiokuThemeCatalog.load();
  if (!context.mounted) {
    return;
  }
  await showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    useSafeArea: true,
    builder: (_) => const _KiokuThemePickerSheet(),
  );
}

/// Settings › Preferences › Theme section for Kioku: Omarchy theme selector, corner geometry, and photo grid gap.
class KiokuAppearanceSettings extends ConsumerWidget {
  const KiokuAppearanceSettings({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final prefs = ref.watch(kiokuPrefsProvider);
    final activeSpec = ref.watch(kiokuActiveThemeSpecProvider);
    final kioku = context.kioku;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ListTile(
          onTap: () => unawaited(showKiokuThemePickerSheet(context)),
          title: const Text('Omarchy theme'),
          subtitle: Text(
            '${activeSpec.name} · ${KiokuThemeCatalog.themes.length} palettes',
            style: kioku.dataStyle(size: 12),
          ),
          trailing: _ThemeSwatchBar(spec: activeSpec),
        ),
        const Divider(height: 1),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Corners', style: Theme.of(context).textTheme.titleSmall),
              const SizedBox(height: 8),
              Row(
                children: [
                  Expanded(
                    child: _SegmentedOption(
                      label: 'Square',
                      selected: !prefs.roundedCorners,
                      onTap: () {
                        unawaited(HapticFeedback.selectionClick());
                        ref.read(kiokuPrefsProvider.notifier).setRoundedCorners(false);
                      },
                    ),
                  ),
                  const SizedBox(width: 6),
                  Expanded(
                    child: _SegmentedOption(
                      label: 'Rounded',
                      selected: prefs.roundedCorners,
                      onTap: () {
                        unawaited(HapticFeedback.selectionClick());
                        ref.read(kiokuPrefsProvider.notifier).setRoundedCorners(true);
                      },
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              Row(
                children: [
                  Text('Photo grid gap', style: Theme.of(context).textTheme.titleSmall),
                  const Spacer(),
                  Text('${prefs.tileGap.round()} px', style: kioku.dataStyle(size: 12)),
                ],
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  for (var i = 0; i < kKiokuTileGapChoices.length; i++) ...[
                    if (i > 0) const SizedBox(width: 6),
                    Expanded(
                      child: _SegmentedOption(
                        label: kKiokuTileGapChoices[i].$2,
                        selected: (prefs.tileGap - kKiokuTileGapChoices[i].$1).abs() < 0.5,
                        onTap: () {
                          unawaited(HapticFeedback.selectionClick());
                          ref.read(kiokuPrefsProvider.notifier).setTileGap(kKiokuTileGapChoices[i].$1);
                        },
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SegmentedOption extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;

  const _SegmentedOption({required this.label, required this.selected, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final kioku = context.kioku;
    return Material(
      color: selected ? kioku.ink : Colors.transparent,
      shape: RoundedRectangleBorder(borderRadius: kioku.borderRadius, side: kioku.hairlineSide),
      child: InkWell(
        borderRadius: kioku.borderRadius,
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 9),
          child: Center(
            child: Text(
              label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: selected ? kioku.surface : kioku.muted,
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ThemeSwatchBar extends StatelessWidget {
  final KiokuThemeSpec spec;

  const _ThemeSwatchBar({required this.spec});

  @override
  Widget build(BuildContext context) {
    final kioku = context.kioku;
    final derived = deriveKiokuTheme(spec);
    final face = spec.mode == Brightness.dark ? derived.dark : derived.light;

    return Container(
      decoration: BoxDecoration(border: Border.fromBorderSide(kioku.hairlineSide), borderRadius: kioku.borderRadius),
      padding: const EdgeInsets.all(2),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _SwatchBox(color: face.surface),
          const SizedBox(width: 2),
          _SwatchBox(color: face.ink),
          const SizedBox(width: 2),
          _SwatchBox(color: face.accent),
        ],
      ),
    );
  }
}

class _SwatchBox extends StatelessWidget {
  final Color color;

  const _SwatchBox({required this.color});

  @override
  Widget build(BuildContext context) => SizedBox.square(
    dimension: 16,
    child: DecoratedBox(decoration: BoxDecoration(color: color)),
  );
}

enum _ModeFilter { all, dark, light }

class _KiokuThemePickerSheet extends HookConsumerWidget {
  const _KiokuThemePickerSheet();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final query = useState('');
    final filter = useState(_ModeFilter.all);
    final activeId = ref.watch(kiokuPrefsProvider.select((p) => p.themeId));
    final kioku = context.kioku;

    final allThemes = <KiokuThemeSpec>[kKiokuDefaultTheme, ...KiokuThemeCatalog.themes];
    final q = query.value.trim().toLowerCase();
    final filtered = allThemes.where((t) {
      if (filter.value == _ModeFilter.dark && t.id.isNotEmpty && t.mode != Brightness.dark) {
        return false;
      }
      if (filter.value == _ModeFilter.light && t.id.isNotEmpty && t.mode != Brightness.light) {
        return false;
      }
      if (q.isEmpty) {
        return true;
      }
      return t.name.toLowerCase().contains(q) || t.id.toLowerCase().contains(q);
    }).toList(growable: false);

    return DraggableScrollableSheet(
      initialChildSize: 0.78,
      minChildSize: 0.45,
      maxChildSize: 0.94,
      expand: false,
      builder: (context, scrollController) => Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 12, 8),
            child: Row(
              children: [
                Text('Themes', style: kioku.displayStyle(size: 22, weight: FontWeight.w700)),
                const SizedBox(width: 8),
                Text('${filtered.length}', style: kioku.dataStyle(size: 12)),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.close, size: 20),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: Column(
              children: [
                TextField(
                  onChanged: (value) => query.value = value,
                  decoration: const InputDecoration(
                    hintText: 'Filter themes…',
                    prefixIcon: Icon(Icons.search, size: 18),
                  ),
                ),
                const SizedBox(height: 8),
                Row(
                  children: [
                    for (final (m, label) in const [
                      (_ModeFilter.all, 'All'),
                      (_ModeFilter.dark, 'Dark'),
                      (_ModeFilter.light, 'Light'),
                    ]) ...[
                      if (m != _ModeFilter.all) const SizedBox(width: 6),
                      Expanded(
                        child: _SegmentedOption(
                          label: label,
                          selected: filter.value == m,
                          onTap: () => filter.value = m,
                        ),
                      ),
                    ],
                  ],
                ),
              ],
            ),
          ),
          const Divider(height: 1),
          Expanded(
            child: ListView.separated(
              controller: scrollController,
              itemCount: filtered.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final spec = filtered[index];
                final selected = spec.id == activeId;
                return InkWell(
                  onTap: () {
                    unawaited(HapticFeedback.selectionClick());
                    ref.read(kiokuPrefsProvider.notifier).setTheme(spec);
                  },
                  child: Container(
                    color: selected ? kioku.ink : Colors.transparent,
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    child: Row(
                      children: [
                        _ThemeSwatchBar(spec: spec),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            spec.name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 14,
                              fontWeight: selected ? FontWeight.w600 : FontWeight.w500,
                              color: selected ? kioku.surface : kioku.ink,
                            ),
                          ),
                        ),
                        Text(
                          spec.id.isEmpty ? 'auto' : (spec.mode == Brightness.dark ? 'dark' : 'light'),
                          style: kioku.dataStyle(
                            size: 11.5,
                            color: selected ? kioku.surface.withValues(alpha: 0.78) : kioku.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
