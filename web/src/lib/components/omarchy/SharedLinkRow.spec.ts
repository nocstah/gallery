import { AssetTypeEnum, SharedLinkType, type SharedLinkResponseDto } from '@immich/sdk';
import { modalManager, toastManager } from '@immich/ui';
import '@testing-library/jest-dom';
import { cleanup, screen, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { DateTime } from 'luxon';
import { init, register, waitLocale } from 'svelte-i18n';
import { getAnimateMock } from '$lib/__mocks__/animate.mock';
// the SDK mock goes first, so the component's own @immich/sdk import resolves to it
import '$lib/__mocks__/sdk.mock';
import { sdkMock } from '$lib/__mocks__/sdk.mock';
import SharedLinkRow from '$lib/components/omarchy/SharedLinkRow.svelte';
import { curatorIsMine, forgetLinkFilm } from '$lib/utils/curator';
import { renderWithTooltips } from '$tests/helpers';
import { albumFactory } from '@test-data/factories/album-factory';
import { assetFactory } from '@test-data/factories/asset-factory';
import { sharedLinkFactory } from '@test-data/factories/shared-link-factory';

// Local Omarchy layer: a shared link as a calm row: what it shows, who can open it, when it ends; Copy, Edit, Turn off
const { emit } = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock('@immich/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@immich/ui')>();
  return { ...original, modalManager: { show: vi.fn(), showDialog: vi.fn() } };
});
vi.mock('$lib/managers/event-manager.svelte', () => ({ eventManager: { emit, on: vi.fn(), off: vi.fn() } }));
vi.mock('$lib/services/shared-link.service', () => ({
  asUrl: ({ key }: { key: string }) => `https://photos.example/share/${key}`,
}));
vi.mock('$lib/utils/curator', () => ({ curatorIsMine: vi.fn(), forgetLinkFilm: vi.fn() }));

const inDays = (days: number) => DateTime.now().plus({ days }).toISO();
const link = (overrides: Partial<SharedLinkResponseDto> = {}) =>
  sharedLinkFactory.build({
    type: SharedLinkType.Individual,
    description: null,
    password: null,
    allowDownload: true,
    allowUpload: false,
    showMetadata: false,
    expiresAt: inDays(5),
    assets: [assetFactory.build({ type: AssetTypeEnum.Image }), assetFactory.build({ type: AssetTypeEnum.Image })],
    ...overrides,
  });

const show = (sharedLink: SharedLinkResponseDto) => {
  renderWithTooltips(SharedLinkRow, { sharedLink });
  return screen.getByTestId('shared-link-row');
};

beforeAll(async () => {
  await init({ fallbackLocale: 'en-US' });
  register('en-US', () => import('$i18n/en.json'));
  await waitLocale('en-US');
});

beforeEach(() => {
  vi.resetAllMocks();
  // (the reset takes the setup's stub of `animate` too)
  Element.prototype.animate = getAnimateMock();
});

describe('SharedLinkRow', () => {
  it('names an album link by the album, says who can open it and when it ends, in days', () => {
    const row = show(
      link({
        type: SharedLinkType.Album,
        album: albumFactory.build({ albumName: 'Riverton 2024', assetCount: 40 }),
        password: 'set',
      }),
    );

    expect(within(row).getByRole('link', { name: 'Riverton 2024' })).toBeInTheDocument();
    expect(within(row).getByTestId('shared-link-facts')).toHaveTextContent(
      'Album · Anyone with the link and its password · Ends in 5 days',
    );
  });

  it("names a memory's link by the memory", () => {
    const row = show(link({ description: 'Riverton · October 2025', allowDownload: false }));

    expect(within(row).getByRole('link', { name: 'Riverton · October 2025' })).toBeInTheDocument();
    expect(within(row).getByTestId('shared-link-facts')).toHaveTextContent(
      'Memory · Anyone with the link · Ends in 5 days',
    );
  });

  it('counts photos without words of their own, and says what a visitor may do beyond looking', () => {
    const row = show(link({ expiresAt: null, allowUpload: true, showMetadata: true }));

    expect(within(row).getByRole('link', { name: '2 photos' })).toBeInTheDocument();
    expect(within(row).getByTestId('shared-link-facts')).toHaveTextContent(
      'Anyone with the link · Never ends · Can add photos · Shows where photos were taken',
    );
  });

  it('offers Copy, Edit and Turn off, each read with the link it acts on', () => {
    const row = show(link({ description: 'Beach day' }));

    const actions = within(row)
      .getAllByRole('button')
      .filter((button) => button.classList.contains('ws-link-action'));
    expect(actions.map((button) => button.textContent?.trim())).toEqual(['Copy', 'Edit', 'Turn off']);
    expect(actions[0]).toHaveAccessibleDescription('Beach day');
  });

  it('turns a link off only once that is confirmed', async () => {
    const sharedLink = link({ description: 'Beach day' });
    show(sharedLink);
    vi.mocked(modalManager.showDialog).mockResolvedValue(false);

    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(modalManager.showDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Turn off this link?', confirmText: 'Turn off', confirmColor: 'danger' }),
    );
    expect(sdkMock.removeSharedLink).not.toHaveBeenCalled();

    vi.mocked(modalManager.showDialog).mockResolvedValue(true);
    await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    expect(sdkMock.removeSharedLink).toHaveBeenCalledWith({ id: sharedLink.id });
    expect(emit).toHaveBeenCalledWith('SharedLinkDelete', sharedLink);
  });

  it('says a link has ended, offers no copy of it, and removes it rather than turning it off', () => {
    const row = show(link({ expiresAt: inDays(-30) }));

    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
    expect(within(row).getByTestId('shared-link-facts')).toHaveTextContent(/Ended \w+ \d+/);
    const actions = within(row)
      .getAllByRole('button')
      .filter((button) => button.classList.contains('ws-link-action'));
    expect(actions.map((button) => button.textContent?.trim())).toEqual(['Edit', 'Remove']);
  });

  describe("a memory's link takes its film with it", () => {
    const film = () => link({ description: 'Riverton · October 2025', allowDownload: false });
    const turnOff = async (sharedLink: SharedLinkResponseDto) => {
      show(sharedLink);
      vi.mocked(modalManager.showDialog).mockResolvedValue(true);
      await userEvent.click(screen.getByRole('button', { name: 'Turn off' }));
    };

    beforeEach(() => {
      vi.mocked(curatorIsMine).mockReturnValue(true);
      vi.spyOn(toastManager, 'primary');
      vi.spyOn(toastManager, 'info');
    });

    it('has Curator forget the film once Gallery has deleted the link, and says nothing more', async () => {
      vi.mocked(forgetLinkFilm).mockResolvedValue('forgotten');
      const sharedLink = film();

      await turnOff(sharedLink);

      await vi.waitFor(() => expect(forgetLinkFilm).toHaveBeenCalledWith(sharedLink.id));
      expect(sdkMock.removeSharedLink.mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(forgetLinkFilm).mock.invocationCallOrder[0],
      );
      expect(toastManager.primary).toHaveBeenCalledWith('Link turned off');
      expect(toastManager.info).not.toHaveBeenCalled();
    });

    it('stays off when Curator cannot forget the film now, and says quietly that it goes tonight', async () => {
      vi.mocked(forgetLinkFilm).mockResolvedValue('later');

      await turnOff(film());

      await vi.waitFor(() =>
        expect(toastManager.info).toHaveBeenCalledWith("The link's film won't be removed until tonight."),
      );
      expect(emit).toHaveBeenCalledWith('SharedLinkDelete', expect.anything());
      expect(toastManager.primary).toHaveBeenCalledWith('Link turned off');
    });

    it("asks Curator even of a link edited out of a memory's shape, and says nothing when it played no film", async () => {
      vi.mocked(forgetLinkFilm).mockResolvedValue('none');
      const photos = link({ description: 'Beach day' });

      await turnOff(photos);

      await vi.waitFor(() => expect(forgetLinkFilm).toHaveBeenCalledWith(photos.id));
      expect(toastManager.info).not.toHaveBeenCalled();
    });

    it("when Curator cannot say whether there was a film, says it of a memory's link only", async () => {
      vi.mocked(forgetLinkFilm).mockResolvedValue('unsure');
      await turnOff(film());
      await vi.waitFor(() => expect(toastManager.info).toHaveBeenCalledOnce());
      cleanup();

      await turnOff(link({ description: 'Beach day' }));
      await vi.waitFor(() => expect(forgetLinkFilm).toHaveBeenCalledTimes(2));
      expect(toastManager.info).toHaveBeenCalledOnce();
    });

    it("asks Curator nothing of an album's link, for another account, or when Gallery kept the link", async () => {
      await turnOff(link({ type: SharedLinkType.Album, album: albumFactory.build({ albumName: 'Riverton 2024' }) }));
      cleanup();

      vi.mocked(curatorIsMine).mockReturnValue(false);
      await turnOff(film());
      cleanup();

      vi.mocked(curatorIsMine).mockReturnValue(true);
      sdkMock.removeSharedLink.mockRejectedValue(new Error('Gallery did not answer'));
      await turnOff(film());

      await vi.waitFor(() => expect(sdkMock.removeSharedLink).toHaveBeenCalledTimes(3));
      expect(forgetLinkFilm).not.toHaveBeenCalled();
    });
  });
});
