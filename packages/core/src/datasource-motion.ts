/** Scroll speed is measured over this much recent motion. */
const SCROLL_VELOCITY_WINDOW_MS = 100;
/** A move longer than this many view extents in one update is a jump unless the speed predicted it. */
const JUMP_EXTENTS = 2;

export interface AxisMove {
  /** The axis moved against its previous direction. */
  readonly reversal: boolean;
  /** The axis moved further than its recent speed explains, like a go-to or the first frame of a drag. */
  readonly jump: boolean;
}

/**
 * Smoothed motion of one scroll axis (rows or columns), from the viewport
 * positions the grid reports as it renders.
 *
 * Speed is the displacement across the samples of the last
 * {@link SCROLL_VELOCITY_WINDOW_MS}; with only the newest sample inside the
 * window it is measured from the sample before, so a discrete move (Page
 * Down) averages over the pause before it. A reversal or an unexplained jump
 * restarts the history, so the speed never carries motion from before it. A
 * jump reports no speed until a following move in the same direction shows the
 * axis is still travelling (a scrollbar drag) rather than parked (a go-to).
 *
 * Deceleration is the smoothed rate the speed falls at. A rest point is
 * predicted only after the speed has fallen for a whole window, so the easing
 * of each wheel notch does not count as the end of a scroll.
 */
export class ScrollAxisMotion {
  private readonly times: number[] = [];
  private readonly positions: number[] = [];
  private measured_velocity = 0;
  private travelling = true;
  /** Units per millisecond squared that the speed is falling at; zero while it is not falling. */
  private deceleration = 0;
  /** When the speed started falling without a break; `undefined` while it is not falling. */
  private slowing_since: number | undefined;
  private last_at = 0;
  direction: -1 | 0 | 1 = 0;

  /** Units per millisecond; the sign is the direction of travel. */
  get velocity(): number {
    return this.travelling ? this.measured_velocity : 0;
  }

  record(at: number, position: number, extent: number): AxisMove {
    const last_index = this.times.length - 1;
    const previous_at = this.times[last_index];
    const previous_position = this.positions[last_index];
    this.last_at = at;
    if (previous_at === undefined || previous_position === undefined) {
      this.times.push(at);
      this.positions.push(position);
      return { reversal: false, jump: false };
    }

    const delta = position - previous_position;
    const elapsed = Math.max(0, at - previous_at);
    const move_direction: -1 | 0 | 1 = delta === 0 ? 0 : delta > 0 ? 1 : -1;
    const reversal =
      move_direction !== 0 && this.direction !== 0 && move_direction !== this.direction;
    const jump_distance = JUMP_EXTENTS * Math.max(1, extent);
    // The speed lags a slowing scroll by up to a window, so a move within half of what
    // the speed predicts still follows it.
    const expected = this.measured_velocity * elapsed;
    const jump =
      Math.abs(delta) > jump_distance &&
      Math.abs(delta - expected) > Math.max(jump_distance, Math.abs(expected) / 2);

    if (reversal || jump) {
      // The previous sample anchors the new history: the move itself is the newest motion.
      this.times.length = 0;
      this.positions.length = 0;
      this.times.push(previous_at);
      this.positions.push(previous_position);
      this.deceleration = 0;
      this.slowing_since = undefined;
    }
    if (jump) this.travelling = false;
    else if (move_direction !== 0) this.travelling = true;
    if (move_direction !== 0) this.direction = move_direction;
    this.times.push(at);
    this.positions.push(position);

    // Keep the newest sample at or before the window start as the anchor.
    const window_start = at - SCROLL_VELOCITY_WINDOW_MS;
    let anchor = 0;
    while (anchor + 1 < this.times.length && (this.times[anchor + 1] ?? at) <= window_start) {
      anchor += 1;
    }
    if (anchor > 0) {
      this.times.splice(0, anchor);
      this.positions.splice(0, anchor);
    }

    const from = this.times.length > 2 && (this.times[0] ?? at) <= window_start ? 1 : 0;
    const from_at = this.times[from] ?? at;
    const from_position = this.positions[from] ?? position;
    const previous_velocity = this.measured_velocity;
    this.measured_velocity = at > from_at ? (position - from_position) / (at - from_at) : 0;

    if (!reversal && !jump && elapsed > 0) {
      const slowing =
        Math.sign(this.measured_velocity) === Math.sign(previous_velocity)
          ? (Math.abs(previous_velocity) - Math.abs(this.measured_velocity)) / elapsed
          : 0;
      const weight = 1 - Math.exp(-elapsed / SCROLL_VELOCITY_WINDOW_MS);
      this.deceleration += (Math.max(0, slowing) - this.deceleration) * weight;
      if (slowing > 0) this.slowing_since ??= at;
      else this.slowing_since = undefined;
    }
    return { reversal, jump };
  }

  /**
   * Distance the axis travels in `durationMs` at its current speed, bounded by
   * where a slowing scroll comes to rest.
   */
  travel(durationMs: number): number {
    return Math.min(Math.abs(this.velocity) * durationMs, this.restDistance());
  }

  /**
   * How far a slowing scroll still travels before it comes to rest; infinite
   * until the speed has fallen for a whole window. Momentum decays roughly
   * exponentially, so the distance is speed² / deceleration.
   */
  restDistance(): number {
    const slowing_for = this.slowing_since === undefined ? 0 : this.last_at - this.slowing_since;
    if (this.deceleration <= 0 || slowing_for < SCROLL_VELOCITY_WINDOW_MS) {
      return Number.POSITIVE_INFINITY;
    }
    return (this.velocity * this.velocity) / this.deceleration;
  }

  reset(): void {
    this.times.length = 0;
    this.positions.length = 0;
    this.measured_velocity = 0;
    this.travelling = true;
    this.deceleration = 0;
    this.slowing_since = undefined;
    this.direction = 0;
  }
}
