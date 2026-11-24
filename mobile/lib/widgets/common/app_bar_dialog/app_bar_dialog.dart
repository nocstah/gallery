import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:flutter_hooks/flutter_hooks.dart' hide Store;
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/gallery/theme/kioku_theme.provider.dart';
import 'package:immich_mobile/gallery/theme/kioku_theme_picker.widget.dart';
import 'package:immich_mobile/gallery/theme/kioku_tokens.dart';
import 'package:immich_mobile/generated/translations.g.dart';
import 'package:immich_mobile/models/server_info/server_disk_info.model.dart';
import 'package:immich_mobile/pages/common/settings.page.dart';
import 'package:immich_mobile/providers/auth.provider.dart';
import 'package:immich_mobile/providers/backup/backup_server.provider.dart';
import 'package:immich_mobile/providers/infrastructure/readonly_mode.provider.dart';
import 'package:immich_mobile/providers/locale_provider.dart';
import 'package:immich_mobile/providers/user.provider.dart';
import 'package:immich_mobile/providers/websocket.provider.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:immich_mobile/utils/bytes_units.dart';
import 'package:immich_mobile/widgets/common/app_bar_dialog/app_bar_profile_info.dart';
import 'package:immich_mobile/widgets/common/app_bar_dialog/app_bar_server_info.dart';
import 'package:immich_mobile/widgets/common/confirm_dialog.dart';
import 'package:immich_mobile/widgets/common/immich_logo.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

class ImmichAppBarDialog extends HookConsumerWidget {
  const ImmichAppBarDialog({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(localeProvider);
    final ServerDiskInfo backupState = ref.watch(backupServerProvider);
    final theme = context.themeData;
    final bool isHorizontal = !context.isMobile;
    final horizontalPadding = isHorizontal ? 100.0 : 20.0;
    final user = ref.watch(currentUserProvider);
    final isLoggingOut = useState(false);
    final isReadonlyModeEnabled = ref.watch(readonlyModeProvider);

    useEffect(() {
      unawaited(ref.read(backupServerProvider.notifier).updateDiskInfo());
      unawaited(ref.read(currentUserProvider.notifier).refresh());
      return null;
    }, []);

    final kioku = context.kioku;
    final activeThemeSpec = ref.watch(kiokuActiveThemeSpecProvider);

    SizedBox buildTopRow() {
      return SizedBox(
        height: 44,
        child: Stack(
          alignment: Alignment.centerLeft,
          children: [
            IconButton(
              visualDensity: VisualDensity.compact,
              onPressed: () => ContextHelper(context).pop(),
              icon: Icon(Icons.close, size: 19, color: kioku.muted),
            ),
            Align(
              alignment: Alignment.center,
              child: Image.asset(
                context.isDarkTheme ? 'assets/immich-text-dark.png' : 'assets/immich-text-light.png',
                height: 20,
              ),
            ),
          ],
        ),
      );
    }

    ListTile buildActionButton(IconData icon, String text, Function() onTap, {Widget? trailing}) {
      return ListTile(
        dense: true,
        visualDensity: const VisualDensity(vertical: -2),
        contentPadding: const EdgeInsets.symmetric(horizontal: 20),
        minLeadingWidth: 28,
        leading: Icon(icon, color: kioku.ink, size: 19),
        title: Text(text, style: theme.textTheme.bodyMedium?.copyWith(color: kioku.ink, fontWeight: FontWeight.w500)),
        onTap: onTap,
        trailing: trailing,
      );
    }

    ListTile buildThemeButton() {
      return buildActionButton(
        Icons.palette_outlined,
        context.t.theme,
        () => unawaited(showKiokuThemePickerSheet(context)),
        trailing: Text(activeThemeSpec.name, style: kioku.dataStyle(size: 11.5)),
      );
    }

    ListTile buildSettingButton() {
      return buildActionButton(
        Icons.settings_outlined,
        context.t.settings,
        () => context.pushRoute(const SettingsRoute()),
      );
    }

    ListTile buildFreeUpSpaceButton() {
      return buildActionButton(
        Icons.cleaning_services_outlined,
        context.t.free_up_space,
        () => context.pushRoute(SettingsSubRoute(section: SettingSection.freeUpSpace)),
      );
    }

    ListTile buildAppLogButton() {
      return buildActionButton(
        Icons.assignment_outlined,
        context.t.profile_drawer_app_logs,
        () => context.pushRoute(const AppLogRoute()),
      );
    }

    ListTile buildSignOutButton() {
      return buildActionButton(
        Icons.logout_rounded,
        context.t.sign_out,
        () async {
          if (isLoggingOut.value) {
            return;
          }

          unawaited(
            showDialog(
              context: context,
              builder: (BuildContext ctx) {
                return ConfirmDialog(
                  title: context.t.app_bar_signout_dialog_title,
                  content: context.t.app_bar_signout_dialog_content,
                  ok: context.t.yes,
                  onOk: () async {
                    isLoggingOut.value = true;
                    await ref.read(authProvider.notifier).logout().whenComplete(() => isLoggingOut.value = false);
                    if (!context.mounted) {
                      return;
                    }

                    ref.read(websocketProvider.notifier).disconnect();
                    if (!context.mounted) {
                      return;
                    }

                    unawaited(context.replaceRoute(const LoginRoute()));
                  },
                );
              },
            ),
          );
        },
        trailing: isLoggingOut.value
            ? const SizedBox.square(dimension: 20, child: CircularProgressIndicator(strokeWidth: 2))
            : null,
      );
    }

    Widget buildStorageInformation() {
      var percentage = backupState.diskUsagePercentage / 100;
      var usedDiskSpace = backupState.diskUse;
      var totalDiskSpace = backupState.diskSize;

      if (user != null && user.hasQuota) {
        usedDiskSpace = formatBytes(user.quotaUsageInBytes);
        totalDiskSpace = formatBytes(user.quotaSizeInBytes);
        percentage = user.quotaUsageInBytes / user.quotaSizeInBytes;
      }

      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          spacing: 8,
          children: [
            Row(
              children: [
                Text(context.t.backup_controller_page_server_storage, style: context.textTheme.labelMedium),
                const Spacer(),
                Text(
                  context.t.backup_controller_page_storage_format(used: usedDiskSpace, total: totalDiskSpace),
                  style: kioku.dataStyle(size: 11.5),
                ),
              ],
            ),
            LinearProgressIndicator(
              minHeight: 4.0,
              value: percentage.isFinite ? percentage.clamp(0.0, 1.0) : 0.0,
              color: kioku.ink,
              backgroundColor: kioku.hairline,
              borderRadius: kioku.borderRadius,
            ),
          ],
        ),
      );
    }

    Padding buildFooter() {
      return Padding(
        padding: const EdgeInsets.only(top: 10, bottom: 20),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            InkWell(
              onTap: () {
                ContextHelper(context).pop();
                unawaited(launchUrl(Uri.parse('https://docs.immich.app'), mode: LaunchMode.externalApplication));
              },
              child: Text(context.t.documentation, style: context.textTheme.bodySmall),
            ),
            const SizedBox(width: 20, child: Text("•", textAlign: TextAlign.center)),
            InkWell(
              onTap: () {
                ContextHelper(context).pop();
                unawaited(
                  launchUrl(Uri.parse('https://github.com/immich-app/immich'), mode: LaunchMode.externalApplication),
                );
              },
              child: Text(context.t.profile_drawer_github, style: context.textTheme.bodySmall),
            ),
            const SizedBox(width: 20, child: Text("•", textAlign: TextAlign.center)),
            InkWell(
              onTap: () async {
                ContextHelper(context).pop();
                final packageInfo = await PackageInfo.fromPlatform();
                if (!context.mounted) {
                  return;
                }

                showLicensePage(
                  context: context,
                  applicationIcon: const Padding(
                    padding: EdgeInsetsGeometry.symmetric(vertical: 10),
                    child: ImmichLogo(size: 40),
                  ),
                  applicationVersion: packageInfo.version,
                );
              },
              child: Text(context.t.licenses, style: context.textTheme.bodySmall),
            ),
          ],
        ),
      );
    }

    Padding buildReadonlyMessage() {
      return Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12.0, vertical: 4.0),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: kioku.chrome,
            borderRadius: kioku.borderRadius,
            border: Border.fromBorderSide(kioku.hairlineSide),
          ),
          child: Text(
            context.t.profile_drawer_readonly_mode,
            style: theme.textTheme.labelMedium?.copyWith(color: kioku.ink),
            textAlign: TextAlign.center,
          ),
        ),
      );
    }

    return Dismissible(
      behavior: HitTestBehavior.translucent,
      direction: DismissDirection.down,
      onDismissed: (_) => ContextHelper(context).pop(),
      key: const Key('app_bar_dialog'),
      child: Dialog(
        backgroundColor: kioku.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        clipBehavior: Clip.hardEdge,
        alignment: Alignment.topCenter,
        insetPadding: EdgeInsets.only(
          top: isHorizontal ? 20 : 36,
          left: horizontalPadding,
          right: horizontalPadding,
          bottom: isHorizontal ? 20 : 80,
        ),
        shape: kioku.shape,
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(padding: const EdgeInsets.symmetric(horizontal: 6), child: buildTopRow()),
              Container(
                decoration: BoxDecoration(
                  color: kioku.surface,
                  borderRadius: kioku.borderRadius,
                  border: Border.fromBorderSide(kioku.hairlineSide),
                ),
                margin: const EdgeInsets.only(left: 12, right: 12, bottom: 6),
                child: Column(
                  children: [
                    const AppBarProfileInfoBox(),
                    Divider(height: 1, thickness: 1, color: kioku.hairline),
                    buildStorageInformation(),
                    Divider(height: 1, thickness: 1, color: kioku.hairline),
                    const AppBarServerInfo(),
                  ],
                ),
              ),
              if (isReadonlyModeEnabled) buildReadonlyMessage(),
              buildThemeButton(),
              buildAppLogButton(),
              buildFreeUpSpaceButton(),
              buildSettingButton(),
              buildSignOutButton(),
              Divider(height: 1, thickness: 1, color: kioku.hairline),
              buildFooter(),
            ],
          ),
        ),
      ),
    );
  }
}
