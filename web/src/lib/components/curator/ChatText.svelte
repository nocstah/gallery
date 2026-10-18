<script lang="ts">
  // Local Omarchy layer: a library-chat answer as reading text. Paragraphs break at blank lines, "- " (or "• ", "* ")
  // lines make a list and "1. " lines a numbered one, **bold** turns strong; everything else stays plain text, so
  // nothing the model writes becomes markup.
  interface Props {
    text: string;
  }

  let { text }: Props = $props();

  type Run = { strong: boolean; text: string };
  type Block = { kind: 'p'; lines: Run[][] } | { kind: 'ul' | 'ol'; items: Run[][] };

  const runs = (line: string): Run[] =>
    line
      .split(/\*\*(.+?)\*\*/g)
      .map((part, index) => ({ strong: index % 2 === 1, text: part }))
      .filter((run) => run.text);

  const blocks = $derived.by(() => {
    const out: Block[] = [];
    for (const chunk of text.split(/\n{2,}/)) {
      let paragraph: Run[][] = [];
      let list: { kind: 'ul' | 'ol'; items: Run[][] } | undefined;
      const close = () => {
        if (paragraph.length > 0) {
          out.push({ kind: 'p', lines: paragraph });
          paragraph = [];
        }
        if (list) {
          out.push(list);
          list = undefined;
        }
      };
      for (const line of chunk.split('\n')) {
        if (!line.trim()) {
          continue;
        }
        const bullet = /^\s*[-•*]\s+(.*)$/.exec(line);
        const numbered = bullet ? null : /^\s*\d+[.)]\s+(.*)$/.exec(line);
        const item = bullet ?? numbered;
        if (item) {
          const kind = bullet ? 'ul' : 'ol';
          if (paragraph.length > 0 || list?.kind !== kind) {
            close();
            list = { kind, items: [] };
          }
          list?.items.push(runs(item[1]));
        } else {
          if (list) {
            close();
          }
          paragraph.push(runs(line));
        }
      }
      close();
    }
    return out;
  });
</script>

{#snippet line(parts: Run[])}
  {#each parts as part, index (index)}
    {#if part.strong}<strong>{part.text}</strong>{:else}{part.text}{/if}
  {/each}
{/snippet}

<div class="chat-text">
  {#each blocks as block, index (index)}
    {#if block.kind === 'p'}
      <p>
        {#each block.lines as parts, at (at)}
          {#if at > 0}<br />{/if}{@render line(parts)}
        {/each}
      </p>
    {:else if block.kind === 'ul'}
      <ul>
        {#each block.items as parts, at (at)}
          <li>{@render line(parts)}</li>
        {/each}
      </ul>
    {:else}
      <ol>
        {#each block.items as parts, at (at)}
          <li>{@render line(parts)}</li>
        {/each}
      </ol>
    {/if}
  {/each}
</div>

<style>
  .chat-text {
    display: grid;
    gap: 0.7rem;
    max-width: 68ch;
    font-size: var(--ws-text-body);
    line-height: 1.6;
    color: var(--immich-ui-dark);
    text-wrap: pretty;
  }
  .chat-text ul,
  .chat-text ol {
    display: grid;
    gap: 0.3rem;
    padding-inline-start: 1.3rem;
  }
  .chat-text ul {
    list-style: disc;
  }
  .chat-text ol {
    list-style: decimal;
  }
  .chat-text li::marker {
    color: var(--immich-ui-muted);
  }
  .chat-text strong {
    font-weight: 650;
  }
</style>
