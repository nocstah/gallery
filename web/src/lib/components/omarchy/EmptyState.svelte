<script lang="ts">
  // Local Omarchy layer: an empty page in the house grammar (DESIGN.md, Buttons and Links): a headline, a sentence of
  // why, and at most one next step, standing on the page's gutter under the bar's title like everything else on it. It
  // takes the place of upstream's EmptyPlaceholder, a grey slab with a cartoon that was itself the button.
  type Props = {
    title: string;
    body?: string;
    /** the one next step, in ink */
    action?: { label: string; onclick: () => unknown };
    /** a way elsewhere, as a quiet link */
    link?: { label: string; href: string };
  };

  const { title, body, action, link }: Props = $props();
</script>

<div class="ws-empty">
  <h2 class="ws-empty-title">{title}</h2>
  {#if body}
    <p class="ws-empty-body">{body}</p>
  {/if}
  {#if action || link}
    <div class="ws-empty-actions">
      {#if action}
        <button type="button" class="ws-empty-action" onclick={() => action.onclick()}>{action.label}</button>
      {/if}
      {#if link}
        <a class="ws-empty-link" href={link.href}>{link.label}</a>
      {/if}
    </div>
  {/if}
</div>
