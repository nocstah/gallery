import { handleError, serverDetail } from '$lib/utils/handle-error';

// Local Omarchy layer: a failed request's toast leads with the page's own translated words and gives the server's reason
// as the line under it only when that adds something; it never names Immich (upstream: the raw server message cut at 75
// characters, then "(Immich Server Error)").

const { toastDanger, ServerError } = vi.hoisted(() => ({
  toastDanger: vi.fn(),
  // the SDK's HttpError as it reaches the page: the status, the answer's body, "Error: <status>" as its message
  ServerError: class extends Error {
    constructor(
      readonly status: number,
      readonly data: unknown,
    ) {
      super(`Error: ${status}`);
    }
  },
}));
vi.mock('@immich/ui', () => ({ toastManager: { danger: toastDanger } }));
vi.mock('@immich/sdk', () => ({ isHttpError: (error: unknown) => error instanceof ServerError }));

const serverError = (status: number, data: unknown) => new ServerError(status, data);

describe('handleError', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it("leads with the page's words and gives the server's reason under them", () => {
    const error = serverError(400, { message: 'Album name is required', error: 'Bad Request', statusCode: 400 });

    const said = handleError(error, 'Unable to save album');

    expect(toastDanger).toHaveBeenCalledWith({ title: 'Unable to save album', description: 'Album name is required' });
    expect(said).toBe('Unable to save album\nAlbum name is required');
    expect(JSON.stringify(toastDanger.mock.calls)).not.toMatch(/immich/i);
  });

  it('says only the words when the server adds nothing to them', () => {
    for (const data of [
      { message: 'Internal server error', statusCode: 500 },
      { message: 'Not Found', error: 'Not Found', statusCode: 404 },
      { message: 'Unable to save album.', statusCode: 400 },
      undefined,
    ]) {
      toastDanger.mockClear();
      const said = handleError(serverError(data?.statusCode ?? 500, data), 'Unable to save album');
      expect(toastDanger).toHaveBeenCalledWith('Unable to save album');
      expect(said).toBe('Unable to save album');
    }
  });

  it('says the words for a failure that is not the server answering', () => {
    expect(handleError(new TypeError('Failed to fetch'), 'Unable to load album')).toBe('Unable to load album');
    expect(toastDanger).toHaveBeenCalledWith('Unable to load album');
  });

  it('keeps its options: no toast when asked for none, nothing for an aborted request', () => {
    const error = serverError(400, { message: 'Album name is required', statusCode: 400 });
    expect(handleError(error, 'Unable to save album', { notify: false })).toBe(
      'Unable to save album\nAlbum name is required',
    );
    expect(toastDanger).not.toHaveBeenCalled();

    expect(handleError(new DOMException('aborted', 'AbortError'), 'Unable to save album')).toBeUndefined();
    expect(toastDanger).not.toHaveBeenCalled();
  });
});

describe('serverDetail', () => {
  it("joins a validation failure's fields, and shortens a long reason with an ellipsis", () => {
    const fields = serverError(400, {
      message: 'Validation failed',
      errors: [{ path: ['albumName'], message: 'must be a string', code: 'invalid_type' }],
      statusCode: 400,
    });
    expect(serverDetail(fields, 'Unable to save album')).toBe('Validation failed: albumName: must be a string');

    const long = serverDetail(serverError(400, { message: 'x'.repeat(400), statusCode: 400 }), 'Unable to save album');
    expect(long).toHaveLength(140);
    expect(long?.endsWith('…')).toBe(true);
  });

  it('takes a list of messages as one line', () => {
    const error = serverError(400, { message: ['name is too long', 'name is not unique'], statusCode: 400 });
    expect(serverDetail(error, 'Unable to save album')).toBe('name is too long, name is not unique');
  });

  it('gives nothing for a status alone', () => {
    expect(serverDetail(serverError(502, 'Bad Gateway'), 'Unable to save album')).toBeUndefined();
  });
});
