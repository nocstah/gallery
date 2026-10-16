import { viewerTaken } from '$lib/components/asset-viewer/viewer-taken';

// Local Omarchy layer: when the photo was taken, as the phone's viewer bar says it beside the back arrow: the moment
// the Info panel shows (the camera's clock in its own zone where the photo has one, else the server's local time),
// the day with its year over the time, in the reader's locale.

// ICU puts a narrow no-break space before AM and PM in some paths and a plain one in others: what is read is the same
const plain = (taken: ReturnType<typeof viewerTaken>) =>
  taken && { date: taken.date.replaceAll(/\s/g, ' '), time: taken.time.replaceAll(/\s/g, ' ') };

describe('viewerTaken', () => {
  it("tells the camera's own clock in the photo's own time zone", () => {
    const taken = plain(
      viewerTaken(
        {
          localDateTime: '2026-10-11T09:23:13.000Z',
          exifInfo: { dateTimeOriginal: '2026-10-11T02:23:13.000Z', timeZone: 'Asia/Bangkok' },
        },
        'en-US',
      ),
    );

    expect(taken).toEqual({ date: 'Sun, Oct 11, 2026', time: '9:23 AM' });
  });

  it('falls back to the local time the server worked out when the photo has no time zone', () => {
    const taken = plain(viewerTaken({ localDateTime: '1977-07-03T18:05:00.000Z', exifInfo: {} }, 'en-US'));

    expect(taken).toEqual({ date: 'Sun, Jul 3, 1977', time: '6:05 PM' });
  });

  it("speaks the reader's language", () => {
    const taken = plain(viewerTaken({ localDateTime: '2026-10-11T09:23:13.000Z' }, 'de-DE'));

    expect(taken).toEqual({ date: 'So., 11. Okt. 2026', time: '9:23' });
  });

  it('says nothing about a date it cannot read', () => {
    expect(viewerTaken({ localDateTime: 'not a date' }, 'en-US')).toBeUndefined();
    expect(viewerTaken({ localDateTime: '' }, 'en-US')).toBeUndefined();
  });
});
