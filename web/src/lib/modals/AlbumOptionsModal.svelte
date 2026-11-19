<script lang="ts">
  // Local Omarchy layer: the album's own settings (its order, comments and likes). Who sees it, its link and its Spaces
  // are the Share sheet's (modals/AlbumShareModal): the owner gets one way there instead of upstream's second copy of
  // the people and links (whose Create link was the long form the sheet's one press replaced); anyone else still sees
  // who the album is shared with.
  import HeaderActionButton from '#lib/components/HeaderActionButton.svelte';
  import UserAvatar from '#lib/components/shared-components/UserAvatar.svelte';
  import { getAlbumQuery, updateAlbumInfoMutation } from '#lib/queries/album.query.ts';
  import { executeMutation, queryClient } from '#lib/queries/client.ts';
  import {
    getAlbumActions,
    handleRemoveUserFromAlbum,
    handleUpdateUserAlbumRole,
  } from '#lib/services/album.service.ts';
  import {
    AlbumUserRole,
    AssetOrder,
    type AlbumResponseDto,
    type UpdateAlbumDto,
    type UserResponseDto,
  } from '@immich/sdk';
  import { Field, HStack, Modal, ModalBody, Select, Stack, Switch, Text, type SelectOption } from '@immich/ui';
  import { createQuery } from '@tanstack/svelte-query';
  import { t } from 'svelte-i18n';

  type Props = {
    album: AlbumResponseDto;
    readOnly?: boolean;
    onClose: () => void;
  };

  let { album: initialAlbum, readOnly = false, onClose }: Props = $props();

  const query = createQuery(
    () => getAlbumQuery(initialAlbum.id),
    () => queryClient,
  );
  const album = $derived(query.data ?? initialAlbum);

  const handleRoleSelect = async (user: UserResponseDto, role: AlbumUserRole | 'none') => {
    if (role === 'none') {
      await handleRemoveUserFromAlbum(album, user);
      return;
    }

    await handleUpdateUserAlbumRole({ albumId: album.id, userId: user.id, role });
  };

  const updateAlbum = (updateAlbumDto: UpdateAlbumDto) =>
    executeMutation(updateAlbumInfoMutation, [{ id: album.id, updateAlbumDto }]);

  const { Share } = $derived(getAlbumActions($t, album));
  // the sheet takes over from here, so this box closes as it opens
  const share = $derived<typeof Share>({
    ...Share,
    onAction: (params) => {
      onClose();
      Share.onAction(params);
    },
  });
</script>

<Modal title={readOnly ? $t('album') : $t('options')} {onClose} size="small">
  <ModalBody>
    <Stack gap={6}>
      <div>
        <Text size="medium" fontWeight="semi-bold">{$t('settings')}</Text>
        <div class="mt-2 grid gap-y-3 ps-2">
          {#if album.order}
            <Field label={$t('display_order')} disabled={readOnly}>
              <Select
                value={album.order}
                options={[
                  { label: $t('newest_first'), value: AssetOrder.Desc },
                  { label: $t('oldest_first'), value: AssetOrder.Asc },
                ]}
                onChange={(value) => updateAlbum({ order: value })}
              />
            </Field>
          {/if}
          <Field label={$t('comments_and_likes')} description={$t('let_others_respond')} disabled={readOnly}>
            <Switch
              checked={album.isActivityEnabled}
              onCheckedChange={(checked) => updateAlbum({ isActivityEnabled: checked })}
            />
          </Field>
        </div>
      </div>

      {#if readOnly}
        <div>
          <Text size="medium" fontWeight="semi-bold" class="mb-2">{$t('people')}</Text>
          <div class="ps-2">
            {#each album.albumUsers as { user, role } (user.id)}
              <div class="flex items-center justify-between gap-4 py-2">
                <div class="flex flex-row items-center gap-2">
                  <div>
                    <UserAvatar {user} size="md" />
                  </div>
                  <Text size="small">{user.name}</Text>
                </div>
                <Field class="w-32" disabled>
                  <Select
                    value={role}
                    options={[
                      { label: $t('role_editor'), value: AlbumUserRole.Editor },
                      { label: $t('role_viewer'), value: AlbumUserRole.Viewer },
                      { label: $t('owner'), value: AlbumUserRole.Owner, disabled: true },
                      { label: $t('remove_user'), value: 'none' },
                    ] as SelectOption<AlbumUserRole | 'none'>[]}
                    onChange={(value) => handleRoleSelect(user, value)}
                  />
                </Field>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="mb-4">
          <HStack fullWidth class="mb-2 justify-between">
            <Text size="medium" fontWeight="semi-bold">{$t('sharing')}</Text>
            <HeaderActionButton action={share} />
          </HStack>
          <Text size="small" color="muted" class="ps-2">{$t('album_options_sharing_note')}</Text>
        </div>
      {/if}
    </Stack>
  </ModalBody>
</Modal>
