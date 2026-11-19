import { flyingTile, viewerStandsOver } from '#lib/utils/viewer-handover.ts';

describe('flyingTile', () => {
  afterEach(() => document.body.replaceChildren());

  // the tile of photo a1
  const tile = () => {
    const element = document.createElement('div');
    element.dataset.thumbnailFocusContainer = '';
    element.dataset.asset = 'a1';
    document.body.append(element);
    return element;
  };

  it('finds the tile of the photo flying out of it', () => {
    const element = tile();
    const flyer = document.createElement('div');
    flyer.dataset.motionFlyer = '';
    document.body.append(flyer);
    expect(flyingTile('a1')).toBe(element);
  });

  it('finds none when no photo is flying, or none was named', () => {
    tile();
    expect(flyingTile('a1')).toBeUndefined();
    expect(flyingTile(undefined)).toBeUndefined();
  });
});

describe('viewerStandsOver', () => {
  afterEach(() => document.body.replaceChildren());

  it('resolves once the viewer is in the page', async () => {
    const viewer = document.createElement('section');
    viewer.id = 'immich-asset-viewer';
    document.body.append(viewer);
    await expect(viewerStandsOver(1000)).resolves.toBeUndefined();
  });

  it('gives up when no viewer comes', async () => {
    const started = performance.now();
    await viewerStandsOver(60);
    expect(performance.now() - started).toBeGreaterThanOrEqual(50);
  });
});
