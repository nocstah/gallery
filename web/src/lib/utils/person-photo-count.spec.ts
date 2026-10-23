import { init, register, t, waitLocale } from 'svelte-i18n';
import { get } from 'svelte/store';
import { personPhotoCount } from '$lib/utils/person-photo-count';

describe('personPhotoCount', () => {
  beforeAll(async () => {
    register('en-US', () => import('$i18n/en.json'));
    await init({ fallbackLocale: 'en-US', initialLocale: 'en-US' });
    await waitLocale('en-US');
  });

  it('counts the photos shown, then those folded into stacks', () => {
    // the critique's person: one tile, a stack of five
    expect(personPhotoCount(get(t), 1, 5)).toEqual(['1 photo', '4 more in stacks']);
    expect(personPhotoCount(get(t), 2100, 2101)).toEqual(['2,100 photos', '1 more in a stack']);
  });

  it('says the count alone when nothing is folded', () => {
    expect(personPhotoCount(get(t), 7, 7)).toEqual(['7 photos']);
    // a count that has not caught up never claims photos in stacks
    expect(personPhotoCount(get(t), 9, 7)).toEqual(['9 photos']);
  });
});
