// Local Omarchy layer: what a page puts in the middle of the one bar (components/omarchy/OmarchyBar.svelte). Photos
// puts its month heading and time ruler there; a page that sets nothing leaves the middle empty. The page clears it
// again when it leaves (or when its content should not show, e.g. while filters are active).
import type { Snippet } from 'svelte';

class BarSlot {
  content = $state<Snippet | undefined>();
}

export const barSlot = new BarSlot();
