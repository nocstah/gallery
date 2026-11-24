import 'package:flutter/material.dart';
import 'package:immich_mobile/constants/locales.dart';
import 'package:immich_mobile/gallery/theme/kioku_theme.provider.dart';
import 'package:immich_mobile/gallery/theme/kioku_theme_derive.dart';
import 'package:immich_mobile/gallery/theme/kioku_tokens.dart';

/// Builds a [ThemeData] speaking Kioku's Tiled Workspace grammar from [face] and [prefs]:
/// - Flat single ground (`surface`), 1px `hairline` boundaries, zero Material 3 surface-tint wash.
/// - Active Border & Inversion: filled buttons, ON switches, and active chrome invert to `ink` fill + `surface` text,
///   while `accent` lights only focus borders, cursors, and text selection.
/// - Consistent corners (`0px` square by default, or `8px` when Rounded corners is enabled).
/// - `MonaSans` body/UI font, `BricolageGrotesque` condensed display headings, `GoogleSansCode` tabular data.
ThemeData buildKiokuThemeData({
  required KiokuFacePalette face,
  required KiokuVisualPrefs prefs,
  required Locale locale,
}) {
  final colorScheme = face.toColorScheme();
  final tokens = KiokuThemeTokens.fromFace(
    face,
    roundedCorners: prefs.roundedCorners,
    tileGap: prefs.tileGap,
    compactLayout: prefs.compactLayout,
  );
  final fontFamily = localesNotSupportedByAppFont.contains(locale) ? null : 'MonaSans';
  final radius = BorderRadius.circular(tokens.radius);
  final hairline = BorderSide(color: tokens.hairline, width: 1);
  final shape = RoundedRectangleBorder(borderRadius: radius);
  final borderedShape = RoundedRectangleBorder(borderRadius: radius, side: hairline);

  return ThemeData(
    useMaterial3: true,
    brightness: face.brightness,
    colorScheme: colorScheme,
    primaryColor: tokens.ink,
    hintColor: tokens.muted,
    focusColor: tokens.accent,
    dividerColor: tokens.hairline,
    scaffoldBackgroundColor: tokens.surface,
    canvasColor: tokens.surface,
    cardColor: tokens.surface,
    splashColor: tokens.ink.withValues(alpha: 0.06),
    highlightColor: tokens.ink.withValues(alpha: 0.05),
    fontFamily: fontFamily,
    extensions: [tokens],
    textTheme: TextTheme(
      displayLarge: tokens.displayStyle(size: 32, weight: FontWeight.w800),
      displayMedium: tokens.displayStyle(size: 24, weight: FontWeight.w700),
      displaySmall: tokens.dataStyle(size: 12, weight: FontWeight.w600, color: tokens.muted),
      headlineLarge: tokens.displayStyle(size: 28, weight: FontWeight.w700),
      headlineMedium: tokens.displayStyle(size: 22, weight: FontWeight.w700),
      headlineSmall: tokens.displayStyle(size: 20, weight: FontWeight.w600),
      titleLarge: tokens.displayStyle(size: 22, weight: FontWeight.w700),
      titleMedium: TextStyle(fontSize: 16, fontWeight: FontWeight.w600, color: tokens.ink),
      titleSmall: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: tokens.ink),
      bodyLarge: TextStyle(fontSize: 15, fontWeight: FontWeight.w400, height: 1.45, color: tokens.ink),
      bodyMedium: TextStyle(fontSize: 14, fontWeight: FontWeight.w400, height: 1.45, color: tokens.ink),
      bodySmall: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w400, height: 1.4, color: tokens.muted),
      labelLarge: TextStyle(fontSize: 14, fontWeight: FontWeight.w600, color: tokens.ink),
      labelMedium: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w500, color: tokens.muted),
      labelSmall: tokens.dataStyle(size: 12, weight: FontWeight.w600, color: tokens.muted),
    ),
    appBarTheme: AppBarTheme(
      toolbarHeight: 48,
      titleTextStyle: tokens.displayStyle(size: 19, weight: FontWeight.w700, color: tokens.ink),
      backgroundColor: tokens.surface,
      foregroundColor: tokens.ink,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
      shape: Border(bottom: hairline),
    ),
    dividerTheme: DividerThemeData(color: tokens.hairline, thickness: 1, space: 1),
    cardTheme: CardThemeData(
      color: tokens.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: borderedShape,
    ),
    listTileTheme: ListTileThemeData(
      dense: true,
      visualDensity: const VisualDensity(horizontal: 0, vertical: -1),
      iconColor: tokens.ink,
      textColor: tokens.ink,
      subtitleTextStyle: TextStyle(fontFamily: fontFamily, fontSize: 12.5, color: tokens.muted),
      titleTextStyle: TextStyle(fontFamily: fontFamily, fontSize: 14, fontWeight: FontWeight.w500, color: tokens.ink),
      shape: shape,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        elevation: 0,
        shadowColor: Colors.transparent,
        backgroundColor: tokens.ink,
        foregroundColor: tokens.surface,
        disabledBackgroundColor: tokens.hairline,
        disabledForegroundColor: tokens.muted,
        shape: shape,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        minimumSize: const Size(0, 42),
        textStyle: TextStyle(fontFamily: fontFamily, fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        elevation: 0,
        backgroundColor: tokens.ink,
        foregroundColor: tokens.surface,
        shape: shape,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        minimumSize: const Size(0, 42),
        textStyle: TextStyle(fontFamily: fontFamily, fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: tokens.ink,
        side: hairline,
        shape: shape,
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        minimumSize: const Size(0, 40),
        textStyle: TextStyle(fontFamily: fontFamily, fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(
        foregroundColor: tokens.ink,
        shape: shape,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        textStyle: TextStyle(fontFamily: fontFamily, fontSize: 14, fontWeight: FontWeight.w600),
      ),
    ),
    iconButtonTheme: IconButtonThemeData(
      style: IconButton.styleFrom(foregroundColor: tokens.ink, shape: shape),
    ),
    switchTheme: SwitchThemeData(
      thumbColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return tokens.surface;
        }
        return tokens.muted;
      }),
      trackColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return tokens.ink;
        }
        return Colors.transparent;
      }),
      trackOutlineColor: WidgetStateProperty.resolveWith((states) {
        if (states.contains(WidgetState.selected)) {
          return tokens.ink;
        }
        return tokens.ink.withValues(alpha: 0.52);
      }),
      trackOutlineWidth: const WidgetStatePropertyAll(1.2),
    ),
    checkboxTheme: CheckboxThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? tokens.ink : Colors.transparent,
      ),
      checkColor: WidgetStatePropertyAll(tokens.surface),
      side: BorderSide(color: tokens.ink.withValues(alpha: 0.55), width: 1.5),
      shape: shape,
    ),
    radioTheme: RadioThemeData(
      fillColor: WidgetStateProperty.resolveWith(
        (states) => states.contains(WidgetState.selected) ? tokens.ink : tokens.muted,
      ),
    ),
    chipTheme: ChipThemeData(
      backgroundColor: tokens.surface,
      selectedColor: tokens.ink,
      labelStyle: TextStyle(fontFamily: fontFamily, fontSize: 13, fontWeight: FontWeight.w500, color: tokens.ink),
      secondaryLabelStyle: TextStyle(
        fontFamily: fontFamily,
        fontSize: 13,
        fontWeight: FontWeight.w600,
        color: tokens.surface,
      ),
      side: hairline,
      shape: shape,
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    ),
    inputDecorationTheme: InputDecorationTheme(
      isDense: true,
      contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
      filled: false,
      border: OutlineInputBorder(borderSide: hairline, borderRadius: radius),
      enabledBorder: OutlineInputBorder(borderSide: hairline, borderRadius: radius),
      focusedBorder: OutlineInputBorder(
        borderSide: BorderSide(color: tokens.accent, width: 1.8),
        borderRadius: radius,
      ),
      errorBorder: OutlineInputBorder(
        borderSide: BorderSide(color: tokens.danger, width: 1.2),
        borderRadius: radius,
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderSide: BorderSide(color: tokens.danger, width: 1.8),
        borderRadius: radius,
      ),
      labelStyle: TextStyle(fontSize: 13, color: tokens.muted),
      floatingLabelStyle: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: tokens.accent),
      hintStyle: TextStyle(fontSize: 14, color: tokens.muted),
    ),
    textSelectionTheme: TextSelectionThemeData(
      cursorColor: tokens.accent,
      selectionColor: tokens.accent.withValues(alpha: 0.26),
      selectionHandleColor: tokens.accent,
    ),
    dropdownMenuTheme: DropdownMenuThemeData(
      menuStyle: MenuStyle(
        backgroundColor: WidgetStatePropertyAll(tokens.surface),
        surfaceTintColor: const WidgetStatePropertyAll(Colors.transparent),
        elevation: const WidgetStatePropertyAll(0),
        shape: WidgetStatePropertyAll(borderedShape),
      ),
      inputDecorationTheme: InputDecorationTheme(
        isDense: true,
        enabledBorder: OutlineInputBorder(borderSide: hairline, borderRadius: radius),
        focusedBorder: OutlineInputBorder(
          borderSide: BorderSide(color: tokens.accent, width: 1.8),
          borderRadius: radius,
        ),
      ),
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: tokens.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: borderedShape,
      titleTextStyle: tokens.displayStyle(size: 20, weight: FontWeight.w700, color: tokens.ink),
      contentTextStyle: TextStyle(fontFamily: fontFamily, fontSize: 14, height: 1.45, color: tokens.ink),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: tokens.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(tokens.radius)),
        side: hairline,
      ),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: tokens.surface,
      surfaceTintColor: Colors.transparent,
      elevation: 0,
      shape: borderedShape,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: tokens.ink,
      contentTextStyle: TextStyle(fontFamily: fontFamily, fontSize: 13.5, fontWeight: FontWeight.w500, color: tokens.surface),
      actionTextColor: tokens.accent,
      shape: shape,
      elevation: 0,
    ),
    sliderTheme: SliderThemeData(
      trackHeight: 4,
      activeTrackColor: tokens.ink,
      inactiveTrackColor: tokens.hairline,
      thumbColor: tokens.ink,
      overlayColor: tokens.accent.withValues(alpha: 0.14),
    ),
    bottomNavigationBarTheme: BottomNavigationBarThemeData(
      type: BottomNavigationBarType.fixed,
      backgroundColor: tokens.surface,
      selectedItemColor: tokens.ink,
      unselectedItemColor: tokens.muted,
      elevation: 0,
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: tokens.surface,
      surfaceTintColor: Colors.transparent,
      indicatorColor: tokens.ink,
      elevation: 0,
      labelTextStyle: WidgetStatePropertyAll(
        TextStyle(fontFamily: fontFamily, fontSize: 13, fontWeight: FontWeight.w500, overflow: TextOverflow.ellipsis),
      ),
    ),
    progressIndicatorTheme: ProgressIndicatorThemeData(
      color: tokens.ink,
      linearTrackColor: tokens.hairline,
      circularTrackColor: tokens.hairline,
    ),
  );
}
