<script lang="ts">
  import { focusTrap } from '$lib/actions/focus-trap';

  interface Props {
    show: boolean;
    active?: boolean;
    /** Local Omarchy layer: land the focus on a quiet start of the trap's own (initialFocus) */
    landing?: boolean;
  }

  let { show = $bindable(), active = $bindable(), landing = false }: Props = $props();
  let start = $state<HTMLElement>();
  const initialFocus = () => (landing ? start : undefined);
</script>

<button type="button" onclick={() => (show = true)}>Open</button>

{#if show}
  <div use:focusTrap={{ active, initialFocus }}>
    {#if landing}
      <p data-testid="landing" tabindex="-1" bind:this={start}>A photo</p>
    {/if}
    <div>
      <span>text</span>
      <button data-testid="one" type="button" onclick={() => (show = false)}>Close</button>
    </div>
    <input data-testid="two" disabled />
    <input data-testid="three" />
  </div>
{/if}
