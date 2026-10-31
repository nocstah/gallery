import type { Suggestion } from '$lib/utils/curator';
import { videoOf, videoPeopleOf, videoPersonCaption, type VideoPerson } from '$lib/utils/inbox-video-people';

// Local Omarchy layer: a "People in this video" card (Curator's video.people). The people are stand-ins.

const anna: VideoPerson = { person_id: 'p-anna', name: 'Anna', seconds: 12.5, box: [540, 960, 108, 192] };
const ben: VideoPerson = { person_id: 'p-ben', name: 'Ben ', seconds: 3725, box: [100, 200, 90, 120] };

const card = (fields: Partial<Suggestion>): Pick<Suggestion, 'kind' | 'payload' | 'asset_ids'> => ({
  kind: 'video.people',
  asset_ids: ['clip'],
  payload: { asset_id: 'clip', size: [1080, 1920], people: [anna, ben] },
  ...fields,
});

describe('videoPeopleOf', () => {
  it("is a card's people in the order Curator gives them", () => {
    expect(videoPeopleOf(card({})).map((person) => person.person_id)).toEqual(['p-anna', 'p-ben']);
  });

  it('is nobody for another kind, or a payload without people', () => {
    expect(videoPeopleOf(card({ kind: 'person.name' }))).toEqual([]);
    expect(videoPeopleOf(card({ payload: { asset_id: 'clip' } }))).toEqual([]);
    expect(videoPeopleOf(card({ payload: { people: [{ name: 'no id' }] } }))).toEqual([]);
  });
});

describe('videoOf', () => {
  it("is the card's video", () => {
    expect(videoOf(card({}))).toBe('clip');
    expect(videoOf(card({ payload: {}, asset_ids: ['other'] }))).toBe('other');
  });
});

describe('videoPersonCaption', () => {
  it('names the person and where in the clip, as every duration reads', () => {
    expect(videoPersonCaption(anna)).toBe('Anna · 0:12');
    expect(videoPersonCaption(ben)).toBe('Ben · 1:02:05');
    expect(videoPersonCaption({ ...anna, seconds: NaN })).toBe('Anna');
  });
});
