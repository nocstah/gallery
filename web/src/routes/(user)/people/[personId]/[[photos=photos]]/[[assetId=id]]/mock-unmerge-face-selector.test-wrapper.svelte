<script lang="ts">
  // Local Omarchy layer: Fix incorrect match's view, saying which photos it was opened with (person-photo-menu.spec)
  interface Props {
    assetIds: string[];
  }

  let { assetIds }: Props = $props();
</script>

<div data-testid="unmerge-face-selector" data-asset-ids={assetIds.join(',')}></div>
