import { deepen } from './film-backdrop';

describe(deepen.name, () => {
  it('makes a colour richer and dimmer, and leaves alpha alone', () => {
    const [r, g, b, a] = deepen(new Uint8Array([200, 100, 100, 255]));

    expect(r).toBeLessThan(200);
    expect(r - g).toBeGreaterThan((200 - 100) * 0.62);
    expect(g).toBe(b);
    expect(a).toBe(255);
  });

  it('keeps grey grey', () => {
    expect([...deepen(new Uint8Array([128, 128, 128, 255]))].slice(0, 3)).toEqual([79, 79, 79]);
  });
});
