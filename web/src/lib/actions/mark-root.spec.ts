import { markRoot } from '#lib/actions/mark-root.ts';

const root = () => document.documentElement;
const element = () => document.createElement('div');

describe('markRoot', () => {
  afterEach(() => {
    delete root().dataset.wsA;
    delete root().dataset.wsB;
  });

  it('marks the root while the element is in the page', () => {
    const mark = markRoot(element(), 'ws-a');
    expect(root().dataset.wsA).toBeDefined();
    mark.destroy();
    expect(root().dataset.wsA).toBeUndefined();
  });

  it('keeps a mark two elements hold until the last lets go', () => {
    const first = markRoot(element(), 'ws-a');
    const second = markRoot(element(), 'ws-a');
    first.destroy();
    expect(root().dataset.wsA).toBeDefined();
    second.destroy();
    expect(root().dataset.wsA).toBeUndefined();
  });

  it('follows the name it is given, none meaning no mark', () => {
    const mark = markRoot(element(), undefined);
    expect(root().dataset.wsA).toBeUndefined();
    mark.update('ws-a');
    expect(root().dataset.wsA).toBeDefined();
    mark.update('ws-b');
    expect(root().dataset.wsA).toBeUndefined();
    expect(root().dataset.wsB).toBeDefined();
    mark.update(undefined);
    expect(root().dataset.wsB).toBeUndefined();
    mark.destroy();
    expect(root().dataset.wsB).toBeUndefined();
  });
});
