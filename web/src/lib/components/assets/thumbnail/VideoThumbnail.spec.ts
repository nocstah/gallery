import { render } from '@testing-library/svelte';
import VideoThumbnail from '$lib/components/assets/thumbnail/VideoThumbnail.svelte';

// Local Omarchy layer: a video's time on its tile is written as every duration is (utils/duration): m:ss under an hour,
// h:mm:ss from one. Upstream wrote "0:18" under a minute and "01:16" under an hour, so two tiles side by side disagreed.
describe('VideoThumbnail time', () => {
  const timeOn = (durationInSeconds: number) => {
    const { container } = render(VideoThumbnail, { url: '/video.mp4', durationInSeconds });
    return container.querySelector('.ws-tile-badge-text')?.textContent?.trim();
  };

  it('writes m:ss under an hour, with or without a full minute', () => {
    expect(timeOn(18.4)).toBe('0:18');
    expect(timeOn(76)).toBe('1:16');
    expect(timeOn(754)).toBe('12:34');
  });

  it('writes h:mm:ss from an hour on', () => {
    expect(timeOn(3723)).toBe('1:02:03');
  });
});
