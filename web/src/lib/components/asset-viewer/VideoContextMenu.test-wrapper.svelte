<script lang="ts">
  import VideoContextMenu from './VideoContextMenu.svelte';
  import type { AssetResponseDto } from '@immich/sdk';

  let { asset }: { asset: AssetResponseDto } = $props();
</script>

<VideoContextMenu {asset}>
  <video aria-label="Test video" tabindex="0"><track kind="captions" /></video>
</VideoContextMenu>
<button type="button">Outside the video</button>
