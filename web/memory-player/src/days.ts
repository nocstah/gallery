import { mount } from 'svelte';
import '../style.css';
import { startMessages } from './messages';
import SeriesFamilyPage from './series/SeriesFamilyPage.svelte';
import { keyOf } from './series/series-family';

// Local Omarchy layer: the family page of "A memory a day, from the beginning", at /days/<key>/ (the gateway serves
// days.html there): its words in the reader's language, which the page's lang says too, and the key from the address.
void startMessages().then((language) => {
  document.documentElement.lang = language.replace('_', '-');
  mount(SeriesFamilyPage, { target: document.querySelector('#app')!, props: { linkKey: keyOf(location.pathname) } });
});
