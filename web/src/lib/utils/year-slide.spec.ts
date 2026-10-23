import { YearSlide, type YearSlideMoves } from '$lib/utils/year-slide';

// a move that waits until the test lets it finish
const deferred = () => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

const recorder = () => {
  const log: string[] = [];
  const pending: ReturnType<typeof deferred>[] = [];
  const moves: YearSlideMoves = {
    away: (side) => {
      log.push(`away ${side}`);
      const move = deferred();
      pending.push(move);
      return move.promise;
    },
    jump: (year) => {
      log.push(`jump ${year}`);
    },
    arrive: (side) => {
      log.push(`arrive ${side}`);
      const move = deferred();
      pending.push(move);
      return move.promise;
    },
    done: () => {
      log.push('done');
    },
  };
  /** lets the move under way finish */
  const finish = async () => {
    pending.shift()?.resolve();
    await flush();
  };
  return { log, moves, finish, pending };
};

describe('YearSlide', () => {
  it('lands three quick presses three years on, in one slide', async () => {
    const slide = new YearSlide();
    const { log, moves, finish } = recorder();

    const landed = slide.slideTo(2025, 2026, moves);
    // the next two presses come while 2026 slides away: each steps on from where the strip is heading
    void slide.slideTo(slide.heading! - 1, 2026, moves);
    void slide.slideTo(slide.heading! - 1, 2026, moves);
    expect(slide.heading).toBe(2023);

    await finish();
    await finish();
    await landed;

    // one jump, to the last year asked for; older years come in from the right
    expect(log).toEqual(['away -1', 'jump 2023', 'arrive 1', 'done']);
    expect(slide.heading).toBeUndefined();
  });

  it('follows a press that comes while a year comes in with a slide of its own', async () => {
    const slide = new YearSlide();
    const { log, moves, finish } = recorder();

    const landed = slide.slideTo(2019, 2020, moves);
    await finish(); // 2020 is away and 2019 coming in
    void slide.slideTo(slide.heading! - 1, 2019, moves);
    await finish(); // 2019 is in, so the strip slides on
    await finish();
    await finish();
    await landed;

    expect(log).toEqual(['away -1', 'jump 2019', 'arrive 1', 'away -1', 'jump 2018', 'arrive 1', 'done']);
  });

  it('brings newer years in from the left', async () => {
    const slide = new YearSlide();
    const { log, moves, finish } = recorder();

    const landed = slide.slideTo(2001, 1999, moves);
    await finish();
    await finish();
    await landed;

    expect(log).toEqual(['away 1', 'jump 2001', 'arrive -1', 'done']);
  });

  it('comes back the way it went when the presses lead back to the year in view', async () => {
    const slide = new YearSlide();
    const { log, moves, finish } = recorder();

    const landed = slide.slideTo(2025, 2026, moves);
    void slide.slideTo(2026, 2026, moves);
    await finish();
    await finish();
    await landed;

    expect(log).toEqual(['away -1', 'arrive -1', 'done']);
  });

  it('does nothing for the year in view while nothing moves', async () => {
    const slide = new YearSlide();
    const { log, moves } = recorder();

    await slide.slideTo(2026, 2026, moves);

    expect(log).toEqual([]);
    expect(slide.heading).toBeUndefined();
  });

  it('ends where it is when a move is cut short', async () => {
    const slide = new YearSlide();
    const { log, moves, pending } = recorder();

    const landed = slide.slideTo(2025, 2026, moves);
    pending.shift()?.reject(new DOMException('The animation was aborted', 'AbortError'));
    await landed;

    expect(log).toEqual(['away -1', 'done']);
    expect(slide.heading).toBeUndefined();
  });

  it('keeps heading for a cut year a moment, so a press close behind steps on from it', () => {
    vi.useFakeTimers();
    try {
      const slide = new YearSlide();
      const jumps: number[] = [];
      const jump = (year: number) => {
        jumps.push(year);
      };

      slide.cutTo(2025, jump);
      slide.cutTo(slide.heading! - 1, jump);
      expect(jumps).toEqual([2025, 2024]);
      expect(slide.heading).toBe(2024);

      vi.advanceTimersByTime(300);
      expect(slide.heading).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
