import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { TreeNode } from '$lib/utils/tree-utils';
import ExplorerTree from './explorer-tree.svelte';

// Local Omarchy layer: the tree Tags and Folders keep in their own sidebar, drawn like the albums' tree
// (components/sidebar/explorer-tree)
const mocks = vi.hoisted(() => ({
  sidebarModeStore: { layout: 'expanded', hoverExpanded: false, railExpanded: false },
  page: { url: new URL('https://gallery.test/tags') },
}));

vi.mock('$lib/stores/sidebar-mode.svelte', () => ({ sidebarModeStore: mocks.sidebarModeStore }));
vi.mock('$app/state', () => ({ page: mocks.page }));

const tree = TreeNode.fromPaths([
  'Trips',
  'Trips/Norway',
  'Trips/Norway/Lofoten',
  'Trips/Bali',
  'Home',
  '10 Years',
  '2 Days',
]);

const renderTree = (active: string) =>
  render(ExplorerTree, {
    tree,
    active,
    getLink: (path: string) => `/tags?path=${encodeURIComponent(path)}`,
    title: 'Tags',
    icon: 'M0 0',
    nodeIcon: { closed: 'M0 0', open: 'M1 1' },
    scope: 'tags',
  });

const rowNames = () => screen.getAllByTestId('explorer-row').map((row) => row.textContent?.trim());

describe('explorer tree', () => {
  it('leads with the page itself, lit at the top level, then the top level by name the way a person numbers them', () => {
    renderTree('');
    expect(screen.getByRole('link', { name: 'Tags' })).toHaveAttribute('aria-current', 'page');
    expect(rowNames()).toEqual(['2 Days', '10 Years', 'Home', 'Trips']);
  });

  it('opens the rows above the one on screen and the one itself, and lights it', async () => {
    renderTree('Trips/Norway');
    await tick();
    expect(rowNames()).toEqual(['2 Days', '10 Years', 'Home', 'Trips', 'Bali', 'Norway', 'Lofoten']);
    const norway = screen.getAllByTestId('explorer-row').find((row) => row.textContent?.trim() === 'Norway');
    expect(norway).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Tags' })).not.toHaveAttribute('aria-current');
  });

  it('closes and opens a row on its chevron, and gives a row with nothing below it none', async () => {
    renderTree('Trips');
    await tick();
    const trips = screen.getAllByTestId('explorer-row').find((row) => row.textContent?.trim() === 'Trips');
    const toggle = trips?.closest('.ws-tree-row')?.querySelector('button');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await fireEvent.click(toggle!);
    expect(rowNames()).toEqual(['2 Days', '10 Years', 'Home', 'Trips']);
    const home = screen.getAllByTestId('explorer-row').find((row) => row.textContent?.trim() === 'Home');
    expect(home?.closest('.ws-tree-row')?.querySelector('button')).toBeNull();
  });
});
