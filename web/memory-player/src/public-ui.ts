// Reuse Gallery's icon component without loading its private SvelteKit shell.
// The public player has no modal stack; password access is a separate page.
export { default as Icon } from '../../node_modules/@immich/ui/dist/components/Icon/Icon.svelte';
export const isModalOpen = () => false;
