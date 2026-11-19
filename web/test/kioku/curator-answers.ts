// Local Omarchy layer: Curator's endpoints (utils/curator) sit beside Immich's under /api but are not in its OpenAPI
// spec, so the shared dispatcher (test/common/dispatcher.ts) cannot match them. The reads a page makes on its own get
// Curator's "nothing here" answer; a spec that needs more mocks utils/curator itself.
type CuratorAnswer = { method: string; path: RegExp; json: unknown };

const answers: CuratorAnswer[] = [
  // an album's smart rule (components/curator): none
  { method: 'GET', path: /^\/api\/smart-albums\/by-album\/[^/]+$/, json: null },
  // the story of an album, a memory or an event: not written
  { method: 'GET', path: /^\/api\/stories$/, json: { story: null } },
];

export const curatorAnswer = (method: string, pathname: string) =>
  answers.find((answer) => answer.method === method && answer.path.test(pathname));
