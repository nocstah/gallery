import type { Handle } from '@sveltejs/kit';
// Local Omarchy layer: the face the UI reads in (styles/omarchy-world.css), preloaded instead of upstream's Google Sans
import MonaSans from '$lib/assets/fonts/MonaSans/MonaSansVF.woff2?url';

// only used during the build to replace the variables from app.html
export const handle = (async ({ event, resolve }) => {
  return resolve(event, {
    transformPageChunk: ({ html }) => {
      return html.replace('%app.font%', () => MonaSans);
    },
  });
}) satisfies Handle;
