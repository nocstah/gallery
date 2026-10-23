<script lang="ts">
  import { page } from '$app/stores';
  import GroupSettings from '$lib/components/user-settings-page/group-settings.svelte';
  import ChangePinCodeSettings from './PinCodeSettings.svelte';
  import DownloadSettings from './DownloadSettings.svelte';
  import FeatureSettings from './FeatureSettings.svelte';
  import NotificationsSettings from './NotificationsSettings.svelte';
  import UserUsageStatistic from './UserUsageStatistic.svelte';
  import { OpenQueryParam, QueryParameter } from '$lib/constants';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import { featureFlagsManager } from '$lib/managers/feature-flags-manager.svelte';
  import { oauth } from '$lib/utils';
  import { type ApiKeyResponseDto, type SessionResponseDto } from '@immich/sdk';
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
    mdiTwoFactorAuthentication,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import SettingAccordion from '$lib/components/shared-components/settings/SettingAccordion.svelte';
  import AppSettings from './AppSettings.svelte';
  import ThemePicker from './ThemePicker.svelte';
  import ChangePasswordSettings from './ChangePasswordSettings.svelte';
  import DeviceList from './DeviceList.svelte';
  import OauthSettings from './OauthSettings.svelte';
  import SharingSettings from './SharingSettings.svelte';
  import UserApiKeyList from './UserApiKeyList.svelte';
  import UserProfileSettings from './UserProfileSettings.svelte';

  interface Props {
    keys?: ApiKeyResponseDto[];
    sessions?: SessionResponseDto[];
  }

  let { keys = $bindable([]), sessions = $bindable([]) }: Props = $props();

  let oauthOpen =
    oauth.isCallback(location) || $page.url.searchParams.get(QueryParameter.OPEN_SETTING) === OpenQueryParam.OAUTH;
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
  <UserApiKeyList bind:keys />
</SettingAccordion>

<SettingAccordion
  icon={mdiDevices}
  key="authorized-devices"
  title={$t('authorized_devices')}
  subtitle={$t('user_settings_devices_description')}
>
  <DeviceList bind:devices={sessions} />
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

<SettingAccordion
  icon={mdiBellOutline}
  key={OpenQueryParam.NOTIFICATIONS}
  title={$t('notifications')}
  subtitle={$t('user_settings_notifications_description')}
>
  <NotificationsSettings />
</SettingAccordion>

{#if featureFlagsManager.value.oauth}
  <SettingAccordion
    icon={mdiTwoFactorAuthentication}
    key={OpenQueryParam.OAUTH}
    title={$t('oauth')}
    subtitle={$t('user_settings_oauth_description')}
    isOpen={oauthOpen || undefined}
  >
    <OauthSettings />
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

<SettingAccordion
  icon={mdiAccountMultipleOutline}
  key="user-groups"
  title={$t('user_groups')}
  subtitle={$t('user_settings_groups_description')}
>
  <GroupSettings user={authManager.user} />
</SettingAccordion>

<SettingAccordion
  icon={mdiLockSmart}
  key="user-pin-code-settings"
  title={$t('user_pin_code_settings')}
  subtitle={$t('user_settings_pin_code_description')}
  autoScrollTo={true}
>
  <ChangePinCodeSettings />
</SettingAccordion>

<!-- Local Omarchy layer: no Purchase section. This fork's build has nothing to buy or activate (PurchaseContent lost
     its product key and buy options, and the /link activation lands on a page that ignores the key), so the section
     only carried upstream's pitch (full-time engineers, a sustainable income) beside the project's Discord and a GitHub
     star: not a family archive's settings. UserPurchaseSettings stays in the tree for upstream merges. -->
<SettingAccordion
  icon={mdiAccountGroupOutline}
  key={OpenQueryParam.SHARING}
  title={$t('sharing')}
  subtitle={$t('user_settings_sharing_description')}
>
  <SharingSettings />
</SettingAccordion>
