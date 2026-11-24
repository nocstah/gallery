import 'dart:async';

import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/gallery/theme/kioku_theme_derive.dart';
import 'package:immich_mobile/providers/infrastructure/settings.provider.dart';

/// Available photo grid gap presets (px): tight (2, default), compact tiled (4), wide tiled (8).
const kKiokuTileGapChoices = <(double gap, String label)>[(2.0, 'Tight'), (4.0, 'Compact'), (8.0, 'Tiled')];

@immutable
class KiokuVisualPrefs {
  final String themeId;
  final bool roundedCorners;
  final double tileGap;
  final bool compactLayout;
  final bool showDayLabels;

  const KiokuVisualPrefs({
    this.themeId = '',
    this.roundedCorners = false,
    this.tileGap = 2.0,
    this.compactLayout = true,
    this.showDayLabels = false,
  });

  KiokuVisualPrefs copyWith({
    String? themeId,
    bool? roundedCorners,
    double? tileGap,
    bool? compactLayout,
    bool? showDayLabels,
  }) => KiokuVisualPrefs(
    themeId: themeId ?? this.themeId,
    roundedCorners: roundedCorners ?? this.roundedCorners,
    tileGap: tileGap ?? this.tileGap,
    compactLayout: compactLayout ?? this.compactLayout,
    showDayLabels: showDayLabels ?? this.showDayLabels,
  );

  @override
  bool operator ==(Object other) =>
      other is KiokuVisualPrefs &&
      other.themeId == themeId &&
      other.roundedCorners == roundedCorners &&
      other.tileGap == tileGap &&
      other.compactLayout == compactLayout &&
      other.showDayLabels == showDayLabels;

  @override
  int get hashCode => Object.hash(themeId, roundedCorners, tileGap, compactLayout, showDayLabels);
}

T? _safeTryGet<T>(StoreKey<T> key) {
  try {
    return Store.tryGet(key);
  } catch (_) {
    return null;
  }
}

void _safePut<T>(StoreKey<T> key, T value) {
  try {
    unawaited(Store.put(key, value));
  } catch (_) {}
}

class KiokuPrefsNotifier extends Notifier<KiokuVisualPrefs> {
  @override
  KiokuVisualPrefs build() => KiokuVisualPrefs(
    themeId: _safeTryGet(StoreKey.kiokuThemeId) ?? '',
    roundedCorners: _safeTryGet(StoreKey.kiokuRoundedCorners) ?? false,
    tileGap: _safeTryGet(StoreKey.kiokuTileGap) ?? 2.0,
    compactLayout: _safeTryGet(StoreKey.kiokuCompactLayout) ?? true,
    showDayLabels: _safeTryGet(StoreKey.kiokuShowDayLabels) ?? false,
  );

  void setTheme(KiokuThemeSpec spec, {bool adoptNativeFace = true}) {
    state = state.copyWith(themeId: spec.id);
    _safePut(StoreKey.kiokuThemeId, spec.id);
    if (adoptNativeFace && spec.id.isNotEmpty) {
      final mode = spec.mode == Brightness.dark ? ThemeMode.dark : ThemeMode.light;
      try {
        unawaited(ref.read(settingsProvider).write(.themeMode, mode));
      } catch (_) {}
    }
  }

  void setRoundedCorners(bool rounded) {
    state = state.copyWith(roundedCorners: rounded);
    _safePut(StoreKey.kiokuRoundedCorners, rounded);
  }

  void setTileGap(double gap) {
    state = state.copyWith(tileGap: gap);
    _safePut(StoreKey.kiokuTileGap, gap);
  }

  void setCompactLayout(bool compact) {
    state = state.copyWith(compactLayout: compact);
    _safePut(StoreKey.kiokuCompactLayout, compact);
  }

  void setShowDayLabels(bool show) {
    state = state.copyWith(showDayLabels: show);
    _safePut(StoreKey.kiokuShowDayLabels, show);
  }
}

final kiokuPrefsProvider = NotifierProvider<KiokuPrefsNotifier, KiokuVisualPrefs>(KiokuPrefsNotifier.new);

final kiokuActiveThemeSpecProvider = Provider<KiokuThemeSpec>((ref) {
  final id = ref.watch(kiokuPrefsProvider.select((p) => p.themeId));
  return KiokuThemeCatalog.byId(id);
});

final kiokuDerivedThemeProvider = Provider<KiokuDerivedTheme>((ref) {
  final spec = ref.watch(kiokuActiveThemeSpecProvider);
  return deriveKiokuTheme(spec);
});
