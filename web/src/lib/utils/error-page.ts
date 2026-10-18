// Local Omarchy layer: what an error page says, by what failed (DESIGN.md, Error pages). The server answers a
// missing album, person, photo or Space and one that is not shared with you the same way (a 400, "Not found or no
// album.read access"), and an ended shared link and one that never existed the same way too (a 401, "Invalid share
// key"), so each kind's words are true for every case it covers. Anything not recognised is "something went
// wrong", with Retry.

export type ErrorPageKind =
  /** an album, a person, a photo or a Space that is not there or not shared with you */
  | 'album'
  | 'person'
  | 'photo'
  | 'space'
  /** a shared link that ended, was turned off or is incomplete */
  | 'link'
  /** an address Gallery has no page for */
  | 'page'
  /** Gallery did not answer at all */
  | 'offline'
  /** anything else */
  | 'failed';

export type ErrorPageInput = {
  /** the page's status (page.status), or the error's own code */
  status?: number | string | null;
  message?: string | null;
  routeId?: string | null;
  params?: Record<string, string | undefined>;
};

/** the kinds that are something not being there: they offer a way back, not Retry */
export const isMissingKind = (kind: ErrorPageKind) => kind !== 'offline' && kind !== 'failed';

const SHARED_LINK_ROUTE = /^\/\(user\)\/(share\/\[key\]|s\/\[slug\])/;
// the server's access check names the permission that failed ("Not found or no album.read access")
const ACCESS_RESOURCE = /\bno ([A-Za-z]+)\.[A-Za-z]+ access\b/;
const RESOURCES: Record<string, ErrorPageKind> = {
  album: 'album',
  asset: 'photo',
  person: 'person',
  sharedSpace: 'space',
};
// a fetch that never reached Gallery (Chromium, Firefox, Safari)
const UNREACHABLE = /failed to fetch|networkerror|load failed|network request failed/i;

const statusOf = (status: ErrorPageInput['status']) => {
  const value = Number(status);
  return Number.isFinite(value) ? value : 0;
};

export const errorPageKind = ({ status, message, routeId, params = {} }: ErrorPageInput): ErrorPageKind => {
  const code = statusOf(status);
  const text = message ?? '';

  if (SHARED_LINK_ROUTE.test(routeId ?? '') && code >= 400 && code < 500) {
    return 'link';
  }
  if (!routeId && code === 404) {
    return 'page';
  }
  if (UNREACHABLE.test(text) || code === 502 || code === 503 || code === 504) {
    return 'offline';
  }
  if (code !== 400 && code !== 403 && code !== 404) {
    return 'failed';
  }

  const resource = RESOURCES[ACCESS_RESOURCE.exec(text)?.[1] ?? ''];
  if (resource) {
    return resource;
  }
  // a check that does not name itself (a validation failure, a 404 of its own): the address says what was asked for,
  // the photo first, since it opens over the album, person or Space it was found in
  if (params.assetId) {
    return 'photo';
  }
  if (params.personId) {
    return 'person';
  }
  if (params.albumId) {
    return 'album';
  }
  if (params.spaceId) {
    return 'space';
  }
  return code === 404 ? 'page' : 'failed';
};

/** the error's code as a number, from SvelteKit's error (code) or a raw HTTP error from the SDK (status) */
export const errorCode = (error: unknown): number | undefined => {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const { code, status } = error as { code?: unknown; status?: unknown };
  const value = Number(code ?? status);
  return Number.isFinite(value) && value > 0 ? value : undefined;
};
