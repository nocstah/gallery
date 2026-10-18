import { errorCode, errorPageKind, isMissingKind } from '$lib/utils/error-page';

const ALBUM_ROUTE = '/(user)/albums/[albumId=id]/[[photos=photos]]/[[assetId=id]]';
const PERSON_ROUTE = '/(user)/people/[personId]/[[photos=photos]]/[[assetId=id]]';
const PHOTOS_ROUTE = '/(user)/photos/[[assetId=id]]';
const SPACE_ROUTE = '/(user)/spaces/[spaceId]/[[photos=photos]]/[[assetId=id]]';
const SHARE_ROUTE = '/(user)/share/[key]/[[photos=photos]]/[[assetId=id]]';
const SLUG_ROUTE = '/(user)/s/[slug]/[[photos=photos]]/[[assetId=id]]';

describe('errorPageKind', () => {
  it('names the album when the server says the album is not there or not shared', () => {
    expect(
      errorPageKind({
        status: 400,
        message: 'Not found or no album.read access',
        routeId: ALBUM_ROUTE,
        params: { albumId: 'a' },
      }),
    ).toBe('album');
  });

  it('names the photo when the album is fine but the photo opened over it is not', () => {
    expect(
      errorPageKind({
        status: 400,
        message: 'Not found or no asset.read access',
        routeId: ALBUM_ROUTE,
        params: { albumId: 'a', assetId: 'b' },
      }),
    ).toBe('photo');
  });

  it('names a person and a Space by the permission that failed', () => {
    expect(errorPageKind({ status: 400, message: 'Not found or no person.read access', routeId: PERSON_ROUTE })).toBe(
      'person',
    );
    expect(
      errorPageKind({ status: 400, message: 'Not found or no sharedSpace.read access', routeId: SPACE_ROUTE }),
    ).toBe('space');
  });

  it('falls back to the address when the error does not name what failed', () => {
    expect(
      errorPageKind({ status: 400, message: 'Validation failed', routeId: ALBUM_ROUTE, params: { albumId: 'x' } }),
    ).toBe('album');
    expect(errorPageKind({ status: 404, message: 'Not Found', routeId: PERSON_ROUTE, params: { personId: 'x' } })).toBe(
      'person',
    );
    expect(errorPageKind({ status: 403, message: 'Forbidden', routeId: PHOTOS_ROUTE, params: { assetId: 'x' } })).toBe(
      'photo',
    );
  });

  it('calls every client error on a shared link an ended link, an expired key and an unknown one alike', () => {
    expect(errorPageKind({ status: 401, message: 'Invalid share key', routeId: SHARE_ROUTE })).toBe('link');
    expect(errorPageKind({ status: 401, message: 'Invalid share slug', routeId: SLUG_ROUTE })).toBe('link');
    expect(
      errorPageKind({
        status: 400,
        message: 'Not found or no asset.read access',
        routeId: SHARE_ROUTE,
        params: { assetId: 'x' },
      }),
    ).toBe('link');
  });

  it('says an unknown address has no page', () => {
    expect(errorPageKind({ status: 404, message: 'Not Found', routeId: null })).toBe('page');
  });

  it('tells a Gallery that did not answer from one that failed', () => {
    expect(errorPageKind({ message: 'Failed to fetch', routeId: PHOTOS_ROUTE })).toBe('offline');
    expect(errorPageKind({ status: 503, message: 'Service Unavailable', routeId: ALBUM_ROUTE })).toBe('offline');
    expect(errorPageKind({ status: 500, message: 'Internal server error', routeId: ALBUM_ROUTE })).toBe('failed');
    expect(errorPageKind({ status: 500, message: 'Internal server error', routeId: SHARE_ROUTE })).toBe('failed');
  });

  it('does not guess past what it knows', () => {
    expect(errorPageKind({ status: 400, message: 'Validation failed', routeId: '/(user)/utilities' })).toBe('failed');
    expect(errorPageKind({ status: 401, message: 'Unauthorized', routeId: ALBUM_ROUTE })).toBe('failed');
    expect(errorPageKind({})).toBe('failed');
  });
});

describe('isMissingKind', () => {
  it('offers a way back for what is missing and Retry for what failed', () => {
    expect(isMissingKind('album')).toBe(true);
    expect(isMissingKind('link')).toBe(true);
    expect(isMissingKind('page')).toBe(true);
    expect(isMissingKind('offline')).toBe(false);
    expect(isMissingKind('failed')).toBe(false);
  });
});

describe('errorCode', () => {
  it("reads SvelteKit's code and the SDK's status", () => {
    expect(errorCode({ message: 'x', code: 400 })).toBe(400);
    expect(errorCode({ message: 'x', code: '404' })).toBe(404);
    expect(errorCode({ status: 503 })).toBe(503);
    expect(errorCode(new TypeError('Failed to fetch'))).toBeUndefined();
    expect(errorCode(undefined)).toBeUndefined();
  });
});
