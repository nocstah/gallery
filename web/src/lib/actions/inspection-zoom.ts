/** Isolated from the main asset viewer: before/after layers share the same transform. */
export const createInspectionZoom = (node: HTMLElement, onChange: (scale: number) => void) => {
  let scale = 1;
  let x = 0;
  let y = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const render = () => {
    x = Math.max((-node.clientWidth * (scale - 1)) / 2, Math.min((node.clientWidth * (scale - 1)) / 2, x));
    y = Math.max((-node.clientHeight * (scale - 1)) / 2, Math.min((node.clientHeight * (scale - 1)) / 2, y));
    node.style.setProperty('--inspect-transform', `translate(${x}px, ${y}px) scale(${scale})`);
    node.style.cursor = scale > 1 ? 'grab' : 'zoom-in';
    onChange(scale);
  };
  const zoomTo = (value: number, clientX?: number, clientY?: number) => {
    const next = Math.max(1, Math.min(8, value));
    const rect = node.getBoundingClientRect();
    const anchorX = clientX === undefined ? 0 : clientX - rect.left - rect.width / 2;
    const anchorY = clientY === undefined ? 0 : clientY - rect.top - rect.height / 2;
    x = anchorX - ((anchorX - x) * next) / scale;
    y = anchorY - ((anchorY - y) * next) / scale;
    scale = next;
    render();
  };
  const controls = (event: Event) =>
    event.target instanceof Element && !!event.target.closest('input, button, a, video[controls]');
  node.addEventListener(
    'wheel',
    (event) => {
      if (controls(event)) {
        return;
      }
      event.preventDefault();
      zoomTo(scale * Math.exp(-event.deltaY * 0.002), event.clientX, event.clientY);
    },
    { ...options, passive: false },
  );
  node.addEventListener(
    'dblclick',
    (event) => {
      if (controls(event)) {
        return;
      }
      event.preventDefault();
      zoomTo(scale > 1 ? 1 : 2, event.clientX, event.clientY);
    },
    options,
  );
  node.addEventListener(
    'pointerdown',
    (event) => {
      if (controls(event) || event.button !== 0) {
        return;
      }
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      node.setPointerCapture(event.pointerId);
    },
    options,
  );
  node.addEventListener(
    'pointermove',
    (event) => {
      const previous = pointers.get(event.pointerId);
      if (!previous) {
        return;
      }
      let other: { x: number; y: number } | undefined;
      for (const [id, point] of pointers) {
        if (id !== event.pointerId) {
          other = point;
          break;
        }
      }
      if (other) {
        const distance = Math.hypot(previous.x - other.x, previous.y - other.y);
        if (distance > 0) {
          zoomTo(
            (scale * Math.hypot(event.clientX - other.x, event.clientY - other.y)) / distance,
            (previous.x + other.x) / 2,
            (previous.y + other.y) / 2,
          );
        }
      }
      x += (event.clientX - previous.x) / (other ? 2 : 1);
      y += (event.clientY - previous.y) / (other ? 2 : 1);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      render();
    },
    options,
  );
  const release = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
  };
  node.addEventListener('pointerup', release, options);
  node.addEventListener('pointercancel', release, options);
  node.addEventListener('lostpointercapture', release, options);
  const resize = new ResizeObserver(render);
  resize.observe(node);
  render();
  return {
    zoomBy: (factor: number) => zoomTo(scale * factor),
    reset: () => {
      x = 0;
      y = 0;
      zoomTo(1);
    },
    destroy: () => {
      abort.abort();
      resize.disconnect();
    },
  };
};
