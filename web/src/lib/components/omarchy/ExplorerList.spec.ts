import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { TreeNode } from '$lib/utils/tree-utils';
import ExplorerList from './ExplorerList.svelte';

// Local Omarchy layer: what a level of Tags or Folders holds, as a calm list (components/omarchy/ExplorerList)
const tree = TreeNode.fromPaths(['/library/2014/10', '/library/2014/2', '/library/2014/2/b', '/library/1999']);
tree.collapse();
const level = tree.traverse('/library/2014');

const renderList = (node: TreeNode) =>
  render(ExplorerList, {
    node,
    getLink: (path: string) => `/folders?path=${encodeURIComponent(path)}`,
    icon: 'M0 0',
    count: (child: TreeNode) => (child.size > 0 ? `${child.size} inside` : undefined),
    label: 'Folders',
  });

describe('explorer list', () => {
  it('lists a level by name the way a person numbers them, each row a link to its page', () => {
    renderList(level);
    const rows = screen.getAllByRole('link');
    expect(rows.map((row) => row.querySelector('.ws-explorer-name')?.textContent)).toEqual(['2', '10']);
    expect(rows[0]).toHaveAttribute('href', `/folders?path=${encodeURIComponent('/library/2014/2')}`);
  });

  it('says in data type what a row holds, and nothing for a row that holds nothing more', () => {
    renderList(level);
    const [two, ten] = screen.getAllByRole('link');
    expect(two).toHaveTextContent('1 inside');
    expect(ten.querySelector('.ws-explorer-count')).toBeNull();
  });

  it('draws nothing for a level with nothing below it', () => {
    renderList(tree.traverse('/library/1999'));
    expect(screen.queryByTestId('explorer-list')).not.toBeInTheDocument();
  });
});
