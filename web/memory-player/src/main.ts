import { mount } from 'svelte';
import '../style.css';
import SharedMemoryPlayer from './SharedMemoryPlayer.svelte';
import { startMessages } from './messages';

void startMessages().then(() => mount(SharedMemoryPlayer, { target: document.querySelector('#app')! }));
