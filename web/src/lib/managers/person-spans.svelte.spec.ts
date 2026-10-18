import { AssetVisibility, TimeBucketSize } from '@immich/sdk';
import { waitFor } from '@testing-library/svelte';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { authManager } from '$lib/managers/auth-manager.svelte';
import { personSpans } from '$lib/managers/person-spans.svelte';
import { preferencesFactory } from '@test-data/factories/preferences-factory';
import { userAdminFactory } from '@test-data/factories/user-factory';

// Local Omarchy layer: the counts and years that tell apart people who share a name (DESIGN.md, People), asked of each
// person's timeline as their own page asks for it, once each. The manager is one for the page load, so each test asks
// for people of its own.
describe('personSpans', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authManager.setUser(userAdminFactory.build({ id: 'me' }));
    authManager.setPreferences(preferencesFactory.build());
  });

  it("asks each person's timeline by year, as their page does, and reads the count and years", async () => {
    sdkMock.getTimeBuckets.mockResolvedValue([
      { timeBucket: '2026-01-01', count: 40 },
      { timeBucket: '2010-01-01', count: 100 },
    ]);

    personSpans.request([{ id: 'daniel-1' }, { id: 'daniel-2', filterId: 'space-person:abc' }]);

    await waitFor(() => expect(personSpans.get('daniel-2')).toEqual({ count: 140, first: 2010, last: 2026 }));
    expect(personSpans.get('daniel-1')).toEqual({ count: 140, first: 2010, last: 2026 });
    expect(sdkMock.getTimeBuckets).toHaveBeenCalledWith(
      expect.objectContaining({
        personIds: ['daniel-1'],
        visibility: AssetVisibility.Timeline,
        withPartners: true,
        withSharedSpaces: true,
        bucketSize: TimeBucketSize.Year,
      }),
    );
    expect(sdkMock.getTimeBuckets).toHaveBeenCalledWith(expect.objectContaining({ personIds: ['space-person:abc'] }));
  });

  it('asks for a person once, however often the page asks', async () => {
    sdkMock.getTimeBuckets.mockResolvedValue([{ timeBucket: '2019-01-01', count: 4 }]);

    personSpans.request([{ id: 'anders' }]);
    personSpans.request([{ id: 'anders' }]);
    await waitFor(() => expect(personSpans.get('anders')).toEqual({ count: 4, first: 2019, last: 2019 }));
    personSpans.request([{ id: 'anders' }]);

    expect(sdkMock.getTimeBuckets).toHaveBeenCalledTimes(1);
  });

  it('remembers a timeline it could not read as null', async () => {
    sdkMock.getTimeBuckets.mockRejectedValue(new Error('offline'));

    personSpans.request([{ id: 'kim' }]);

    await waitFor(() => expect(personSpans.get('kim')).toBeNull());
  });

  it('knows nothing of a person it was not asked about', () => {
    expect(personSpans.get('someone-else')).toBeUndefined();
  });
});
