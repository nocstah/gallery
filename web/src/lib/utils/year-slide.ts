// Local Omarchy layer: how the year strip goes from year to year (components/timeline/TimelineWorkspaces, DESIGN.md
// Time Strip). It heads for a year, and every press (or click on a year) steps on from the year it heads for, not from
// the one still in view, so no press is lost while a year slides: ] ] ] had landed one year, the presses during the
// 500 ms slide dropped (2026-10-23). While the year in view slides away, a press only changes where the slide goes: the
// timeline jumps once, to the last year asked for, and that year comes in. One asked for while a year comes in follows
// it: that year comes in whole, then the strip slides on, as the desktop goes on from workspace to workspace.

/** The slide's moves, on the timeline's layer. A side is -1 (the left) or 1 (the right). */
export type YearSlideMoves = {
  /** the year in view slides away toward `side`, and is held there once gone */
  away: (side: -1 | 1) => Promise<void>;
  /** the timeline jumps to `year` */
  jump: (year: number) => void;
  /** the year now in view comes in from `side`; resolves once it is in */
  arrive: (side: -1 | 1) => Promise<void>;
  /** lets go of whatever the moves left on the layer: the slide is over */
  done: () => void;
};

/** How long a cut (reduced motion, or the desktop's workspace animation off) keeps heading for its year: a press close
 * behind steps on from it before the month in view has caught up with the jump. */
const CUT_HELD_MS = 300;

export class YearSlide {
  #heading: number | undefined;
  #running: Promise<void> | undefined;
  #held: ReturnType<typeof setTimeout> | undefined;

  /** The year the strip is heading for while it moves, else undefined: the next press steps on from it. */
  get heading() {
    return this.#heading;
  }

  /** Slides from `shown` (the year in view) to `year`; a slide under way takes the new year up instead. */
  slideTo(year: number, shown: number, moves: YearSlideMoves): Promise<void> {
    if (this.#heading === undefined && year === shown) {
      return Promise.resolve();
    }
    this.#heading = year;
    this.#running ??= this.#run(shown, moves).finally(() => {
      this.#running = undefined;
      this.#heading = undefined;
    });
    return this.#running;
  }

  /** Cuts straight to `year`, with no slide. */
  cutTo(year: number, jump: (year: number) => void) {
    this.#heading = year;
    jump(year);
    clearTimeout(this.#held);
    this.#held = setTimeout(() => (this.#heading = undefined), CUT_HELD_MS);
  }

  async #run(from: number, moves: YearSlideMoves) {
    let shown = from;
    try {
      while (this.#heading !== undefined && this.#heading !== shown) {
        // older years arrive from the right, so the year in view leaves to the left for one
        const toward = this.#heading < shown ? -1 : 1;
        await moves.away(toward);
        // the last year asked for while the one in view slid away
        const year = this.#heading ?? shown;
        const before = shown;
        if (year !== shown) {
          moves.jump(year);
          shown = year;
        }
        // back where it was, the year comes back the way it went
        const side = shown === before ? toward : shown < before ? 1 : -1;
        await moves.arrive(side);
      }
    } catch {
      // a move cut short (the page went away mid-slide): the slide ends where it is
    } finally {
      moves.done();
    }
  }
}
