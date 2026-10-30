import { AssetVisibility, type AssetResponseDto } from '@immich/sdk';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import { markRevealed, revealInPhotos, takeReveal, takeRevealClick } from '$lib/utils/reveal';

const mocks = vi.hoisted(() => ({ goto: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: mocks.goto }));
vi.mock('$lib/managers/auth-manager.svelte', () => ({ authManager: { params: {} } }));

const asset = (overrides: Partial<AssetResponseDto> = {}) =>
  ({ id: 'photo', visibility: AssetVisibility.Timeline, stack: null, ...overrides }) as AssetResponseDto;

describe('Show in Photos', () => {
  beforeEach(() => {
    mocks.goto.mockReset();
    takeReveal('photo'); // nothing left over from another test
    takeReveal('cover');
  });

  it('opens Photos at the photo and selects it there, once', async () => {
    sdkMock.getAssetInfo.mockResolvedValue(asset());

    await revealInPhotos('photo');

    expect(mocks.goto).toHaveBeenCalledWith('/photos?at=photo');
    expect(takeReveal('photo')).toEqual({ at: 'photo', select: 'photo', stackId: undefined });
    expect(takeReveal('photo')).toBeUndefined();
  });

  it('goes to the cover of the stack a photo is folded under, to lay the stack out and select the photo itself', async () => {
    sdkMock.getAssetInfo.mockResolvedValue(
      asset({ stack: { id: 'stack', primaryAssetId: 'cover', assetCount: 2 } as AssetResponseDto['stack'] }),
    );

    await revealInPhotos('photo');

    expect(mocks.goto).toHaveBeenCalledWith('/photos?at=cover');
    expect(takeReveal('cover')).toEqual({ at: 'cover', select: 'photo', stackId: 'stack' });
  });

  it('shows an archived photo in Archive', async () => {
    sdkMock.getAssetInfo.mockResolvedValue(asset({ visibility: AssetVisibility.Archive }));

    await revealInPhotos('photo');

    expect(mocks.goto).toHaveBeenCalledWith('/archive?at=photo');
  });

  it('waits for the timeline it is meant for, and forgets a reveal that never arrives', async () => {
    sdkMock.getAssetInfo.mockResolvedValue(asset());
    await revealInPhotos('photo');

    expect(takeReveal('another')).toBeUndefined();
    expect(takeReveal(undefined)).toBeUndefined();
    const now = performance.now();
    const later = vi.spyOn(performance, 'now').mockReturnValue(now + 20_000);
    expect(takeReveal('photo')).toBeUndefined();
    later.mockRestore();
  });
});

describe("Show in Photos' soft selection", () => {
  const selection = (...ids: string[]) => ({ assets: ids.map((id) => ({ id })), clear: vi.fn() });

  beforeEach(() => {
    takeRevealClick(selection(), false); // nothing left over from another test
  });

  it('lets the first plain click open a photo, dropping the revealed photo from the selection', () => {
    markRevealed('photo');
    const selected = selection('photo');

    expect(takeRevealClick(selected, false)).toBe(true);
    expect(selected.clear).toHaveBeenCalledOnce();
    // once: the click after it selects as usual
    expect(takeRevealClick(selection('photo'), false)).toBe(false);
  });

  it('keeps selecting on a click with Shift', () => {
    markRevealed('photo');
    const selected = selection('photo');

    expect(takeRevealClick(selected, true)).toBe(false);
    expect(selected.clear).not.toHaveBeenCalled();
    expect(takeRevealClick(selection('photo'), false)).toBe(false);
  });

  it('keeps selecting once the selection holds anything else, or nothing', () => {
    markRevealed('photo');
    const more = selection('photo', 'other');
    expect(takeRevealClick(more, false)).toBe(false);
    expect(more.clear).not.toHaveBeenCalled();

    markRevealed('photo');
    expect(takeRevealClick(selection('other'), false)).toBe(false);
    markRevealed('photo');
    expect(takeRevealClick(selection(), false)).toBe(false);
  });

  it('does nothing without a reveal', () => {
    const selected = selection('photo');
    expect(takeRevealClick(selected, false)).toBe(false);
    expect(selected.clear).not.toHaveBeenCalled();
  });
});
