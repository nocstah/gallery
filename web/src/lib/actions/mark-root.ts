// Local Omarchy layer: marks the document (`data-<name>` on the root) while an element is in the page, for rules
// elsewhere in it to key off. They asked `body:has(...)` for that, and a `:has()` on the body or on any element that
// holds the timeline made Chrome style the whole page again whenever anything in it changed: 30-45ms each time the
// pointer came onto a photo, or a thumbnail loaded (2026-11-18). A mark on the root costs that only when it changes.
//
// Counted per name, so two elements holding the same mark (a bar mounting before the last one has gone) keep it until
// the last of them lets go. The name can change or be left out (`undefined`: no mark), so a component can hold a mark
// only while it is in some state.

const holders = new Map<string, number>();

const take = (name: string) => {
  holders.set(name, (holders.get(name) ?? 0) + 1);
  document.documentElement.setAttribute(`data-${name}`, '');
};

const release = (name: string) => {
  const left = (holders.get(name) ?? 1) - 1;
  if (left > 0) {
    holders.set(name, left);
    return;
  }
  holders.delete(name);
  document.documentElement.removeAttribute(`data-${name}`);
};

export const markRoot = (_node: Element, name: string | undefined) => {
  let held = name;
  if (held) {
    take(held);
  }
  return {
    update(next: string | undefined) {
      if (next === held) {
        return;
      }
      if (held) {
        release(held);
      }
      held = next;
      if (held) {
        take(held);
      }
    },
    destroy() {
      if (held) {
        release(held);
      }
      held = undefined;
    },
  };
};
