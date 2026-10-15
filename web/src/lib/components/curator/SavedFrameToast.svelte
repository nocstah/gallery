<script lang="ts">
  // Local Omarchy layer: the toast once a video's frame is saved as a photo (save-frame.svelte.ts). It is @immich/ui's
  // own toast (container, content, buttons) with two actions where its ready-made one has room for one: View opens the
  // new photo, Undo trashes it. Its corners and buttons take the window radius, like every popup of the layer.
  import { Button, ToastContainer, ToastContent } from '@immich/ui';
  import { t } from 'svelte-i18n';

  interface Props {
    description: string;
    onView: () => unknown;
    onUndo: () => unknown;
    /** the toast manager's own, which takes the toast away */
    onClose: () => void;
  }

  let { description, onView, onUndo, onClose }: Props = $props();

  const act = (action: () => unknown) => () => {
    onClose();
    void action();
  };
</script>

<ToastContainer color="primary" class="ws-toast">
  <ToastContent color="primary" title={$t('success')} {description} {onClose}>
    <div class="flex justify-end gap-2 px-3 pt-2">
      <Button color="secondary" variant="ghost" size="small" onclick={act(onView)}>{$t('view')}</Button>
      <Button color="primary" size="small" onclick={act(onUndo)}>{$t('undo')}</Button>
    </div>
  </ToastContent>
</ToastContainer>

<style>
  :global(.ws-toast),
  :global(.ws-toast :is(button, [class*='rounded'])) {
    border-radius: var(--ws-radius);
  }
</style>
