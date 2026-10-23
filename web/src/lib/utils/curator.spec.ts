import { authManager } from '$lib/managers/auth-manager.svelte';
import { curator, CuratorError, curatorIsMine, forgetLinkFilm, waitForJob, type JobRow } from '$lib/utils/curator';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';

// Local Omarchy layer: the one gate in front of Curator's tools. Curator acts for its owner only, the owner of its API
// key, who is this server's admin; any other account (a family member's) is offered none of them.

const signIn = (isAdmin: boolean) => {
  authManager.setUser(userAdminFactory.build({ isAdmin }));
  authManager.setPreferences(preferencesFactory.build());
};

describe('curatorIsMine', () => {
  afterEach(() => {
    authManager.reset();
  });

  it('is false while nobody is signed in (a shared link), without reading a user that is not there', () => {
    expect(curatorIsMine()).toBe(false);
  });

  it("is true for the server's admin, whose key Curator holds", () => {
    signIn(true);
    expect(curatorIsMine()).toBe(true);
  });

  it("is false for a family member's account", () => {
    signIn(false);
    expect(curatorIsMine()).toBe(false);
  });

  it('follows a sign-out and the next sign-in in the same tab', () => {
    signIn(true);
    expect(curatorIsMine()).toBe(true);
    authManager.reset();
    expect(curatorIsMine()).toBe(false);
    signIn(false);
    expect(curatorIsMine()).toBe(false);
  });
});

describe('waitForJob', () => {
  const done: JobRow = {
    id: 7,
    kind: 'share.video',
    status: 'done',
    progress: {},
    result: null,
    error: null,
    created_at: '2026-10-16T05:00:00Z',
    started_at: null,
    finished_at: null,
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    authManager.reset();
  });

  it("asks nothing about the owner's job while another account is signed in, and follows it once the owner is back", async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(Response.json([done])));
    signIn(false);
    const waiting = waitForJob(7, undefined, 100);
    await vi.advanceTimersByTimeAsync(500);
    expect(fetchMock).not.toHaveBeenCalled();

    signIn(true);
    await vi.advanceTimersByTimeAsync(100);
    await expect(waiting).resolves.toEqual(done);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("a memory link's film", () => {
  // Curator's address as the browser asks it: the page's host on Curator's port, over http locally
  const api = (path: string) => `${location.protocol}//${location.hostname}:2290/api${path}`;
  const answers = (...replies: (Response | Error)[]) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    for (const reply of replies) {
      if (reply instanceof Error) {
        fetchMock.mockRejectedValueOnce(reply);
      } else {
        fetchMock.mockResolvedValueOnce(reply);
      }
    }
    return fetchMock;
  };
  const shares = { shares: { link: { memoryId: 'memory', music: true } } };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('asks Curator which links play a film, with the session cookie', async () => {
    const fetchMock = answers(Response.json(shares));

    await expect(curator.memoryShares()).resolves.toEqual(shares);
    expect(fetchMock).toHaveBeenCalledWith(
      api('/memories/shares'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it("asks Curator to forget a link's film once Gallery has deleted the link", async () => {
    const fetchMock = answers(Response.json({ forgotten: true, songs: 1 }));

    await expect(curator.forgetMemoryShare('memory one', 'link')).resolves.toEqual({ forgotten: true, songs: 1 });
    expect(fetchMock).toHaveBeenCalledWith(api('/memories/memory%20one/share/link'), {
      method: 'DELETE',
      credentials: 'include',
      headers: undefined,
    });
  });

  it("gives Curator's refusal and its reason, or says Curator is not answering", async () => {
    answers(
      Response.json({ detail: 'Gallery still has this link; turn it off first' }, { status: 409 }),
      new TypeError('Failed to fetch'),
    );

    const refused = await curator.forgetMemoryShare('memory', 'link').catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(CuratorError);
    expect(refused).toMatchObject({ status: 409, message: 'Gallery still has this link; turn it off first' });
    await expect(curator.forgetMemoryShare('memory', 'link')).rejects.toMatchObject({
      status: 0,
      message: 'Curator is not answering',
    });
  });

  it('forgets the film of a link Curator kept one for, under the memory it plays', async () => {
    const fetchMock = answers(Response.json(shares), Response.json({ forgotten: true, songs: 0 }));

    await expect(forgetLinkFilm('link')).resolves.toBe('forgotten');
    expect(fetchMock).toHaveBeenLastCalledWith(api('/memories/memory/share/link'), expect.anything());
  });

  it('asks nothing more for a link that plays no film', async () => {
    const fetchMock = answers(Response.json(shares));

    await expect(forgetLinkFilm('another link')).resolves.toBe('none');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('leaves the film to the nightly sweep when Curator refuses or does not answer, and never throws', async () => {
    answers(Response.json(shares), Response.json({ detail: 'Gallery did not say' }, { status: 502 }));
    await expect(forgetLinkFilm('link')).resolves.toBe('later');

    answers(Response.json(shares), new TypeError('Failed to fetch'));
    await expect(forgetLinkFilm('link')).resolves.toBe('later');
  });

  it('is unsure when Curator cannot say which links play a film', async () => {
    const fetchMock = answers(new TypeError('Failed to fetch'));

    await expect(forgetLinkFilm('link')).resolves.toBe('unsure');
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
