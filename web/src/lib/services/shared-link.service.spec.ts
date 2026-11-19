import '#lib/gallery/__mocks__/sdk.mock.ts';
import { eventManager } from '#lib/managers/event-manager.svelte.ts';
import { asUrl, handleCreateSharedLink, makeSharedLink, shareLinkExpiry } from '#lib/services/shared-link.service.ts';
import { sharedLinkFactory } from '#test/kioku/factories/shared-link-factory.ts';
import { factory } from '#test/unit/factories.ts';
import { SharedLinkType } from '@immich/sdk';
import { modalManager } from '@immich/ui';

// The SDK mock registers itself when its module loads; loaded here (hoisted), it comes before the code under test
// imports @immich/sdk, which the import order above would otherwise load first
const { sdkMock } = await vi.hoisted(() => import('#lib/gallery/__mocks__/sdk.mock.ts'));

vi.mock(import('#lib/queries/client.js'), async (importOriginal) => ({
  ...(await importOriginal()),
  readPreloadedQuery: vi.fn().mockReturnValue({ server: { externalDomain: 'http://localhost:2283' } }),
}));

// a refusal is reported as everywhere else; this spec only asks what comes back
vi.mock('#lib/utils/handle-error.ts', () => ({ handleError: vi.fn() }));

vi.mock('@immich/ui', async (importOriginal) => {
  const original = await importOriginal<typeof import('@immich/ui')>();
  return { ...original, modalManager: { show: vi.fn(), showDialog: vi.fn() } };
});

describe('SharedLinkService', () => {
  describe('asUrl', () => {
    it('should properly encode characters in slug', () => {
      expect(asUrl(factory.sharedLink({ slug: 'foo/bar' }))).toBe('http://localhost:2283/s/foo%2Fbar');
    });
  });

  // Local Omarchy layer: a link made in one press is open for 30 days (the owner's default)
  describe('shareLinkExpiry', () => {
    it('is 30 days on', () => {
      expect(shareLinkExpiry(Date.UTC(2026, 9, 16))).toBe('2026-11-15T00:00:00.000Z');
    });
  });

  // Local Omarchy layer: the Share sheet makes a link in one press and shows it with its QR in place
  describe('makeSharedLink', () => {
    const dto = {
      type: SharedLinkType.Individual,
      assetIds: ['a1'],
      allowDownload: true,
      allowUpload: false,
      showMetadata: false,
      expiresAt: null,
    };

    beforeEach(() => {
      sdkMock.createSharedLink.mockReset();
      sdkMock.updateSharedLink.mockReset();
      vi.mocked(modalManager.show).mockReset();
    });

    it('hands the link back and tells the app, without a QR dialog of its own', async () => {
      const made = sharedLinkFactory.build({ allowDownload: true });
      sdkMock.createSharedLink.mockResolvedValue(made);
      const emit = vi.spyOn(eventManager, 'emit');

      await expect(makeSharedLink(dto)).resolves.toEqual(made);

      expect(sdkMock.createSharedLink).toHaveBeenCalledWith({ sharedLinkCreateDto: dto });
      expect(emit).toHaveBeenCalledWith('SharedLinkCreate', made);
      expect(modalManager.show).not.toHaveBeenCalled();
    });

    it('turns downloads back on where the server turned them off with the place', async () => {
      const made = sharedLinkFactory.build({ id: 'link-1', allowDownload: false });
      const fixed = { ...made, allowDownload: true };
      sdkMock.createSharedLink.mockResolvedValue(made);
      sdkMock.updateSharedLink.mockResolvedValue(fixed);

      await expect(makeSharedLink(dto)).resolves.toEqual(fixed);

      expect(sdkMock.updateSharedLink).toHaveBeenCalledWith({
        id: 'link-1',
        sharedLinkEditDto: { allowDownload: true },
      });
    });

    it('hands back nothing when the server refuses', async () => {
      sdkMock.createSharedLink.mockRejectedValue(new Error('no'));

      await expect(makeSharedLink(dto)).resolves.toBeUndefined();
    });

    it('still shows the QR in a dialog when made through the create form', async () => {
      sdkMock.createSharedLink.mockResolvedValue(sharedLinkFactory.build({ allowDownload: true }));

      await expect(handleCreateSharedLink(dto)).resolves.toBe(true);

      await vi.waitFor(() => expect(modalManager.show).toHaveBeenCalled());
    });
  });
});
