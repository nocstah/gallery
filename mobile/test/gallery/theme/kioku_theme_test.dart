import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/gallery/theme/kioku_theme.provider.dart';
import 'package:immich_mobile/gallery/theme/kioku_theme_data.dart';
import 'package:immich_mobile/gallery/theme/kioku_theme_derive.dart';
import 'package:immich_mobile/gallery/theme/kioku_tokens.dart';
import 'package:immich_ui/immich_ui.dart';

void main() {
  group('Kioku theme derivation', () {
    test('default neutral theme meets WCAG AA contrast on both faces', () {
      final derived = deriveKiokuTheme(kKiokuDefaultTheme);
      for (final face in [derived.light, derived.dark]) {
        expect(wcagContrast(face.ink, face.surface), greaterThanOrEqualTo(7.0));
        expect(wcagContrast(face.muted, face.surface), greaterThanOrEqualTo(4.5));
        expect(wcagContrast(face.accent, face.surface), greaterThanOrEqualTo(4.5));
        expect(wcagContrast(face.danger, face.surface), greaterThanOrEqualTo(4.5));

        final scheme = face.toColorScheme();
        expect(scheme.primary, face.ink);
        expect(scheme.onPrimary, face.surface);
        expect(scheme.secondary, face.accent);
        expect(scheme.surfaceTint, Colors.transparent);
      }
    });

    test('all bundled Omarchy themes parse and satisfy AA contrast on native face', () {
      final file = File('assets/kioku-themes.json');
      expect(file.existsSync(), isTrue);

      final decoded = jsonDecode(file.readAsStringSync()) as List<dynamic>;
      final specs = decoded.whereType<Map<String, dynamic>>().map(KiokuThemeSpec.fromJson).toList();
      expect(specs.length, greaterThanOrEqualTo(100));

      for (final spec in specs) {
        final derived = deriveKiokuTheme(spec);
        final native = spec.mode == Brightness.dark ? derived.dark : derived.light;
        expect(
          wcagContrast(native.muted, native.surface),
          greaterThanOrEqualTo(4.5),
          reason: '${spec.id} muted contrast',
        );
        expect(
          wcagContrast(native.accent, native.surface),
          greaterThanOrEqualTo(4.5),
          reason: '${spec.id} accent contrast',
        );
        expect(
          wcagContrast(native.danger, native.surface),
          greaterThanOrEqualTo(4.5),
          reason: '${spec.id} danger contrast',
        );
      }
    });

    test('buildKiokuThemeData attaches KiokuThemeTokens matching corner and gap prefs', () {
      final derived = deriveKiokuTheme(kKiokuDefaultTheme);

      final squareTheme = buildKiokuThemeData(
        face: derived.dark,
        prefs: const KiokuVisualPrefs(roundedCorners: false, tileGap: 4.0),
        locale: const Locale('en'),
      );
      final squareTokens = squareTheme.extension<KiokuThemeTokens>()!;
      expect(squareTokens.radius, 0.0);
      expect(squareTokens.tileRadius, 0.0);
      expect(squareTokens.tileGap, 4.0);

      final roundedTheme = buildKiokuThemeData(
        face: derived.light,
        prefs: const KiokuVisualPrefs(roundedCorners: true, tileGap: 8.0),
        locale: const Locale('en'),
      );
      final roundedTokens = roundedTheme.extension<KiokuThemeTokens>()!;
      expect(roundedTokens.radius, 8.0);
      expect(roundedTokens.tileRadius, 4.0);
      expect(roundedTokens.tileGap, 8.0);
    });

    testWidgets('ImmichThemeProvider preserves KiokuThemeTokens and input border radius', (tester) async {
      const tokyo = KiokuThemeSpec(
        id: 'tokyo-night',
        name: 'Tokyo Night',
        mode: Brightness.dark,
        background: Color(0xFF1A1B26),
        foreground: Color(0xFFC0CAF5),
        accent: Color(0xFF7AA2F7),
      );
      final derived = deriveKiokuTheme(tokyo);
      final theme = buildKiokuThemeData(
        face: derived.dark,
        prefs: const KiokuVisualPrefs(themeId: 'tokyo-night', roundedCorners: false, tileGap: 4.0),
        locale: const Locale('en'),
      );

      late KiokuThemeTokens resolvedTokens;
      late InputBorder? resolvedEnabledBorder;
      await tester.pumpWidget(
        MaterialApp(
          theme: theme,
          home: Builder(
            builder: (context) => ImmichThemeProvider(
              colorScheme: Theme.of(context).colorScheme,
              child: Builder(
                builder: (inner) {
                  resolvedTokens = inner.kioku;
                  resolvedEnabledBorder = Theme.of(inner).inputDecorationTheme.enabledBorder;
                  return const SizedBox.shrink();
                },
              ),
            ),
          ),
        ),
      );

      expect(resolvedTokens.surface, derived.dark.surface);
      expect(resolvedTokens.ink, derived.dark.ink);
      expect(resolvedTokens.radius, 0.0);
      expect((resolvedEnabledBorder! as OutlineInputBorder).borderRadius, BorderRadius.zero);
    });
  });
}
