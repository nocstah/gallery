import { mount } from 'svelte';
import { init, register, waitLocale } from 'svelte-i18n';
import '../style.css';
import SharedMemoryPlayer from './SharedMemoryPlayer.svelte';

const messages = {
  en: () => import('virtual:memory-messages/en'),
  de: () => import('virtual:memory-messages/de'),
  fr: () => import('virtual:memory-messages/fr'),
  it: () => import('virtual:memory-messages/it'),
  nl: () => import('virtual:memory-messages/nl'),
  pl: () => import('virtual:memory-messages/pl'),
  es: () => import('virtual:memory-messages/es'),
  ru: () => import('virtual:memory-messages/ru'),
  zh_Hans: () => import('virtual:memory-messages/zh_Hans'),
  zh_Hant: () => import('virtual:memory-messages/zh_Hant'),
};
for (const [language, load] of Object.entries(messages)) {
  register(language, load);
}
const requested = navigator.language.replace('-', '_');
const languages = new Set(Object.keys(messages));
const language = languages.has(requested)
  ? requested
  : requested.startsWith('zh_')
    ? /TW|HK|Hant/i.test(requested)
      ? 'zh_Hant'
      : 'zh_Hans'
    : requested.split('_', 1)[0];
void init({ fallbackLocale: 'en', initialLocale: languages.has(language) ? language : 'en' });
void waitLocale().then(() => mount(SharedMemoryPlayer, { target: document.querySelector('#app')! }));
