// Local Omarchy layer: what a page puts in the one bar (components/omarchy/OmarchyBar.svelte): `content` fills the
// middle (Photos: its month heading, months and years; other pages: their title row), `tools` goes first among the
// bar's icons on the right (Photos: its filter button), so a page's own icon sits with the others instead of at the
// end of the middle. A page that sets nothing leaves them empty, and clears them again when it leaves (or when they
// should not show, e.g. while filters are active).
import type { Snippet } from 'svelte';

class BarSlot {
  content = $state<Snippet | undefined>();
  tools = $state<Snippet | undefined>();
}

export const barSlot = new BarSlot();
