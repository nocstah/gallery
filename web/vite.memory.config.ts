import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The standalone build does not load SvelteKit's config, which normally creates this bundle.
const mergedDir = resolve(import.meta.dirname, '../i18n/gallery/merged');

/** Standalone public player: no Gallery shell, authentication manager, private API or SvelteKit runtime. */
export default defineConfig({
  root: resolve(import.meta.dirname, 'memory-player'),
  base: '/memory-player/',
  resolve: {
    alias: [
      { find: '$lib', replacement: resolve(import.meta.dirname, 'src/lib') },
      { find: /^@immich\/ui$/, replacement: resolve(import.meta.dirname, 'memory-player/src/public-ui.ts') },
    ],
  },
  plugins: [
    {
      name: 'memory-translations',
      buildStart() {
        execFileSync(process.execPath, [resolve(import.meta.dirname, '../i18n/gallery/merge.mjs')], {
          stdio: 'inherit',
        });
      },
      resolveId(id) {
        return id.startsWith('virtual:memory-messages/') ? `\0${id}` : undefined;
      },
      load(id) {
        const match = /^\0virtual:memory-messages\/(en|de|fr|it|nl|pl|es|ru|zh_Hans|zh_Hant)$/.exec(id);
        if (!match) {
          return;
        }
        const common = new Set([
          'close',
          'next_memory',
          'all_photos',
          'pause_memories',
          'play_memories',
          'x_of_total',
          'unmute_memories',
          'mute_memories',
          'video',
          'image',
          'back',
          'password',
          'loading',
          'retry',
        ]);
        const messages = JSON.parse(readFileSync(resolve(mergedDir, `${match[1]}.json`), 'utf8'));
        const selected = Object.fromEntries(
          Object.entries(messages).filter(
            ([key]) => key.startsWith('memory_') || key.startsWith('memories_') || common.has(key),
          ),
        );
        return `export default ${JSON.stringify(selected)}`;
      },
    },
    svelte({
      configFile: false,
      preprocess: vitePreprocess(),
      onwarn: (warning, handler) => {
        if (warning.code !== 'state_referenced_locally') {
          handler(warning);
        }
      },
    }),
    tailwindcss(),
  ],
  build: { outDir: resolve(import.meta.dirname, 'build-memory-player'), emptyOutDir: true, target: 'es2022' },
});
