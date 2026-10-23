import type { PersonResponseDto } from '@immich/sdk';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { timeBeforeShowLoadingSpinner } from '$lib/constants';
import { createPeopleSearch } from '$lib/gallery/people/people-search';

const person = (name: string): PersonResponseDto =>
  ({ id: name, name, isHidden: false, birthDate: null, thumbnailPath: '' }) as PersonResponseDto;
const rowan = person('Rowan Hale');
const batch = (count: number) => Array.from({ length: count }, (_, index) => person(`Rachel ${index}`));
const callbacks = () => ({ onResults: vi.fn(), onLoading: vi.fn(), onError: vi.fn() });
const deferred = () => {
  let resolve!: (people: PersonResponseDto[]) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<PersonResponseDto[]>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

beforeEach(() => {
  sdkMock.searchPerson.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('people search', () => {
  it.each([
    { withSharedSpaces: true, count: 50 },
    { withSharedSpaces: false, count: 100 },
  ])('fetches a narrower query after a full $count-result batch', async ({ withSharedSpaces, count }) => {
    const events = callbacks();
    const search = createPeopleSearch(events);
    sdkMock.searchPerson.mockResolvedValueOnce(batch(count)).mockResolvedValueOnce([rowan]);

    await search.search('R', { withSharedSpaces, numberPeopleToSearch: 5 });
    await search.search('Rowan', { withSharedSpaces, numberPeopleToSearch: 5 });

    expect(sdkMock.searchPerson).toHaveBeenCalledTimes(2);
    expect(sdkMock.searchPerson).toHaveBeenLastCalledWith(
      { name: 'Rowan', ...(withSharedSpaces && { withSharedSpaces }) },
      { signal: expect.any(AbortSignal) },
    );
    expect(events.onResults).toHaveBeenLastCalledWith([rowan]);
  });

  it('reuses a complete batch when narrowing, and still refreshes on a forced search', async () => {
    const events = callbacks();
    const search = createPeopleSearch(events);
    sdkMock.searchPerson.mockResolvedValue([person('Robin'), rowan]);

    await search.search('Ro', { withSharedSpaces: true });
    await search.search('Rowan', { withSharedSpaces: true });
    expect(sdkMock.searchPerson).toHaveBeenCalledTimes(1);
    expect(events.onResults).toHaveBeenLastCalledWith([rowan]);

    await search.search('Rowan', { withSharedSpaces: true, force: true });
    expect(sdkMock.searchPerson).toHaveBeenCalledTimes(2);
  });

  it('fetches again when the search scope changes', async () => {
    const search = createPeopleSearch(callbacks());
    sdkMock.searchPerson.mockResolvedValue([rowan]);
    await search.search('Ro');
    await search.search('Rowan', { withSharedSpaces: true });
    expect(sdkMock.searchPerson).toHaveBeenCalledTimes(2);
  });

  it('ignores an old response that arrives after the current result', async () => {
    const events = callbacks();
    const search = createPeopleSearch(events);
    const old = deferred();
    sdkMock.searchPerson.mockReturnValueOnce(old.promise).mockResolvedValueOnce([rowan]);
    const pending = search.search('R', { withSharedSpaces: true });
    const signal = sdkMock.searchPerson.mock.calls[0][1]?.signal;
    await search.search('Rowan', { withSharedSpaces: true });
    expect(signal?.aborted).toBe(true);
    old.resolve(batch(50));
    await pending;

    expect(events.onResults).toHaveBeenCalledTimes(1);
    expect(events.onResults).toHaveBeenLastCalledWith([rowan]);
  });

  it('keeps the current loading state and cancellation when an old request finishes', async () => {
    vi.useFakeTimers();
    const events = callbacks();
    const search = createPeopleSearch(events);
    const old = deferred();
    const current = deferred();
    sdkMock.searchPerson.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    const first = search.search('R');
    const second = search.search('Rowan');
    old.reject(new DOMException('Aborted', 'AbortError'));
    await first;
    await vi.advanceTimersByTimeAsync(timeBeforeShowLoadingSpinner);
    expect(events.onLoading).toHaveBeenLastCalledWith(true);
    expect(events.onError).not.toHaveBeenCalled();

    search.cancel();
    expect(sdkMock.searchPerson.mock.calls[1][1]?.signal?.aborted).toBe(true);
    expect(events.onLoading).toHaveBeenLastCalledWith(false);
    current.resolve([rowan]);
    await second;
    expect(events.onResults).not.toHaveBeenCalled();
  });

  it('cancels a pending request when returning to a cached prefix', async () => {
    const events = callbacks();
    const search = createPeopleSearch(events);
    const old = deferred();
    sdkMock.searchPerson.mockResolvedValueOnce([rowan]).mockReturnValueOnce(old.promise);
    await search.search('Ro');
    const pending = search.search('Alice');
    await search.search('Rowan');
    old.resolve([person('Alice')]);
    await pending;
    expect(events.onResults).toHaveBeenLastCalledWith([rowan]);
  });

  it('clears results and cache on reset and ignores a pending response', async () => {
    const events = callbacks();
    const search = createPeopleSearch(events);
    const pending = deferred();
    sdkMock.searchPerson
      .mockResolvedValueOnce([rowan])
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce([rowan]);
    await search.search('Ro');
    const work = search.search('Alice');
    search.reset();
    pending.resolve([person('Alice')]);
    await work;
    expect(events.onResults).toHaveBeenLastCalledWith([]);
    await search.search('Rowan');
    expect(sdkMock.searchPerson).toHaveBeenCalledTimes(3);
    expect(events.onResults).toHaveBeenLastCalledWith([rowan]);
  });

  it('reports a current failure and clears the loading state', async () => {
    const events = callbacks();
    const error = new Error('Offline');
    sdkMock.searchPerson.mockRejectedValue(error);
    await createPeopleSearch(events).search('Rowan');
    expect(events.onError).toHaveBeenCalledWith(error);
    expect(events.onLoading).toHaveBeenLastCalledWith(false);
  });
});
