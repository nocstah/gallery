<script lang="ts">
  import SettingAccordion from '#lib/components/shared-components/settings/SettingAccordion.svelte';
  import GroupSettings from '#lib/components/user-settings-page/group-settings.svelte';
  import { OpenQueryParam, QueryParameter } from '#lib/constants.ts';
  import { vaultEdition } from '#lib/gallery/edition.ts';
  import { authManager } from '#lib/managers/auth-manager.svelte.ts';
  import { createPreloadedQuery } from '#lib/queries/client.ts';
  import { getUserConfigQuery } from '#lib/queries/config-user.query.ts';
  import { oauth } from '#lib/utils.ts';
  import {
    mdiAccountGroupOutline,
    mdiAccountMultipleOutline,
    mdiAccountOutline,
    mdiApi,
    mdiBellOutline,
    mdiCogOutline,
    mdiDevices,
    mdiDownload,
    mdiFeatureSearchOutline,
    mdiFormTextboxPassword,
    mdiLockSmart,
    mdiPaletteOutline,
    mdiServerOutline,
    mdiShieldKeyOutline,
    mdiTwoFactorAuthentication,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { page } from '$app/state';
  import AppSettings from './AppSettings.svelte';
  import ChangePasswordSettings from './ChangePasswordSettings.svelte';
  import DeviceList from './DeviceList.svelte';
  import DownloadSettings from './DownloadSettings.svelte';
  import FeatureSettings from './FeatureSettings.svelte';
  import NotificationsSettings from './NotificationsSettings.svelte';
  import OAuthSettings from './OAuthSettings.svelte';
  import ChangePinCodeSettings from './PinCodeSettings.svelte';
  import SharingSettings from './SharingSettings.svelte';
  import ThemePicker from './ThemePicker.svelte';
  import UserApiKeyList from './UserApiKeyList.svelte';
  import UserPasskeyList from './UserPasskeyList.svelte';
  import UserProfileSettings from './UserProfileSettings.svelte';
  import UserUsageStatistic from './UserUsageStatistic.svelte';

  const query = createPreloadedQuery(getUserConfigQuery);
  const config = $derived(query.data);
  let oauthOpen =
    oauth.isCallback(location) || page.url.searchParams.get(QueryParameter.OPEN_SETTING) === OpenQueryParam.OAUTH;
</script>

<!-- Local Omarchy layer: each row says what its section changes, in the family's words (user_settings_*_description),
     where upstream's said "Manage your …"; Gallery's theme follows Omarchy or wears one of the installed themes -->
<SettingAccordion icon={mdiPaletteOutline} key="theme" title={$t('theme')} subtitle={$t('theme_settings_description')}>
  <ThemePicker />
</SettingAccordion>

<SettingAccordion
  icon={mdiCogOutline}
  key="app-settings"
  title={$t('app_settings')}
  subtitle={$t('user_settings_app_description')}
>
  <AppSettings />
</SettingAccordion>

<SettingAccordion
  icon={mdiAccountOutline}
  key="account"
  title={$t('account')}
  subtitle={$t('user_settings_account_description')}
>
  <UserProfileSettings />
</SettingAccordion>

<SettingAccordion
  icon={mdiServerOutline}
  key="user-usage-info"
  title={$t('user_usage_stats')}
  subtitle={$t('user_settings_usage_description')}
>
  <UserUsageStatistic />
</SettingAccordion>

<SettingAccordion
  icon={mdiApi}
  key="api-keys"
  title={$t('api_keys')}
  subtitle={$t('user_settings_api_keys_description')}
>
  <UserApiKeyList />
</SettingAccordion>

<SettingAccordion
  icon={mdiDevices}
  key="authorized-devices"
  title={$t('authorized_devices')}
  subtitle={$t('user_settings_devices_description')}
>
  <DeviceList />
</SettingAccordion>

<SettingAccordion
  icon={mdiDownload}
  key="download-settings"
  title={$t('download_settings')}
  subtitle={$t('user_settings_download_description')}
>
  <DownloadSettings />
</SettingAccordion>

<SettingAccordion
  icon={mdiFeatureSearchOutline}
  key="feature"
  title={$t('features')}
  subtitle={$t('user_settings_features_description')}
>
  <FeatureSettings />
</SettingAccordion>

<!-- Local Omarchy layer: a vault's Gallery has no email, other accounts, Locked Folder or sharing (gallery/edition) -->
{#if !vaultEdition()}
  <SettingAccordion
    icon={mdiBellOutline}
    key={OpenQueryParam.NOTIFICATIONS}
    title={$t('notifications')}
    subtitle={$t('user_settings_notifications_description')}
  >
    <NotificationsSettings />
  </SettingAccordion>
{/if}

{#if config.oauth.enabled}
  <SettingAccordion
    icon={mdiTwoFactorAuthentication}
    key={OpenQueryParam.OAUTH}
    title={$t('oauth')}
    subtitle={$t('user_settings_oauth_description')}
    isOpen={oauthOpen || undefined}
  >
    <OAuthSettings />
  </SettingAccordion>
{/if}

{#if config.passkey.enabled}
  <SettingAccordion
    icon={mdiShieldKeyOutline}
    key="passkeys"
    title={$t('passkeys', { values: { count: 5 } })}
    subtitle={$t('manage_your_passkeys')}
  >
    <UserPasskeyList />
  </SettingAccordion>
{/if}

<SettingAccordion
  icon={mdiFormTextboxPassword}
  key="password"
  title={$t('password')}
  subtitle={$t('user_settings_password_description')}
>
  <ChangePasswordSettings />
</SettingAccordion>

{#if !vaultEdition()}
  <SettingAccordion
    icon={mdiAccountMultipleOutline}
    key="user-groups"
    title={$t('user_groups')}
    subtitle={$t('user_settings_groups_description')}
  >
    <GroupSettings user={authManager.user} />
  </SettingAccordion>
{/if}

{#if !vaultEdition()}
  <SettingAccordion
    icon={mdiLockSmart}
    key="user-pin-code-settings"
    title={$t('user_pin_code_settings')}
    subtitle={$t('user_settings_pin_code_description')}
    autoScrollTo={true}
  >
    <ChangePinCodeSettings />
  </SettingAccordion>
{/if}

<!-- Local Omarchy layer: no Purchase section. This fork's build has nothing to buy or activate (PurchaseContent lost
     its product key and buy options, and the /link activation lands on a page that ignores the key), so the section
     only carried upstream's pitch (full-time engineers, a sustainable income) beside the project's Discord and a GitHub
     star: not a family archive's settings. UserPurchaseSettings stays in the tree for upstream merges. -->
{#if !vaultEdition()}
  <SettingAccordion
    icon={mdiAccountGroupOutline}
    key={OpenQueryParam.SHARING}
    title={$t('sharing')}
    subtitle={$t('user_settings_sharing_description')}
  >
    <SharingSettings />
  </SettingAccordion>
{/if}
