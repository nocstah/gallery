import { MediaQuery } from 'svelte/reactivity';

const pointerCoarse = new MediaQuery('pointer:coarse');
// Local Omarchy layer: a phone, where the one bar keeps the menu button without the mark and upload waits for a wider
// screen (OmarchyBar), notifications move into the account menu and a poster's title moves into the bar
const maxSm = new MediaQuery('max-width: 639px');
const maxMd = new MediaQuery('max-width: 767px');
const sidebar = new MediaQuery(`min-width: 850px`);
const reducedMotion = new MediaQuery('prefers-reduced-motion: reduce');
const minLg = new MediaQuery('min-width: 1024px');

export const mediaQueryManager = {
  get pointerCoarse() {
    return pointerCoarse.current;
  },
  get isPhone() {
    return maxSm.current;
  },
  get maxMd() {
    return maxMd.current;
  },
  get isFullSidebar() {
    return sidebar.current;
  },
  get reducedMotion() {
    return reducedMotion.current;
  },
  get minLg() {
    return minLg.current;
  },
};
