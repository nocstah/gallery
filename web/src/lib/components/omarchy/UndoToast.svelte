<script lang="ts">
  // Local Omarchy layer: the toast of something just made, with a way to it (Open) beside its Undo, where @immich/ui's
  // ready-made toast has room for one button. It is @immich/ui's own toast (container, content, buttons), the same
  // shape as Curator's saved-frame toast; its corners come from the layer's rule for every toast (omarchy-world.css).
  import { Button, ToastContainer, ToastContent } from '@immich/ui';
  import { t } from 'svelte-i18n';

  interface Props {
    description: string;
    /** info when the thing was only partly done */
    tone?: 'primary' | 'info';
    /** the way to what was made ("Open") */
    action: { label: string; onclick: () => unknown };
    onUndo: () => unknown;
    /** the toast manager's own, which takes the toast away */
    onClose: () => void;
  }

  let { description, tone = 'primary', action, onUndo, onClose }: Props = $props();

  const act = (run: () => unknown) => () => {
    onClose();
    void run();
  };
</script>

<ToastContainer color={tone}>
  <ToastContent color={tone} title={tone === 'info' ? $t('info') : $t('success')} {description} {onClose}>
    <div class="flex justify-end gap-2 px-3 pt-2">
      <Button color="secondary" variant="ghost" size="small" onclick={act(action.onclick)}>{action.label}</Button>
      <Button color="primary" size="small" onclick={act(onUndo)}>{$t('undo')}</Button>
    </div>
  </ToastContent>
</ToastContainer>
