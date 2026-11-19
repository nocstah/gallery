// Kioku's specs run on happy-dom with @testing-library/jest-dom (test/kioku/setup.ts), whose toHaveTextContent takes a
// RegExp too. Since v5.11 the matcher types come from @vitest/browser's jest-dom copy, which takes a string or number
// only (it has toMatchTextContent for patterns); this widens it for the old specs.
import 'vitest';

declare module 'vitest' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- T must keep Vitest's name and place for this to merge with its Assertion<R, T>
  interface Assertion<R, T> {
    toHaveTextContent(text?: string | number | RegExp, options?: { normalizeWhitespace: boolean }): R;
  }
}
