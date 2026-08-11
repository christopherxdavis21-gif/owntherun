/**
 * GPS smoothing + dead reckoning helpers.
 *
 * Raw CoreLocation fixes are jagged: even a good fix carries a few metres of
 * error, and with the phone locked in a pocket iOS mixes in coarse cell/wifi
 * fixes. Drawing those verbatim is what makes a trace zig-zag across streets.
 *
 * `GpsKalman` is the standard 1-D-per-axis Kalman filter used by most fitness
 * trackers: the state is the current position, the measurement noise is the
 * reported horizontal accuracy, and the process noise grows with elapsed time
 * scaled by an assumed movement speed. It keeps the line on the road without
 * lagging behind genuine turns.
 *
 * `deadReckonDistance` covers the other half of the problem: when GPS drops
 * out (tunnel, dense tree cover, iOS throttling a locked app) we still get
 * fixes carrying a valid `speed` from the Doppler shift / motion coprocessor.
 * Rather than record a bogus position we accrue distance from speed x time,
 * which is how Strava keeps mileage sane through a gap.
 */

/** Assumed movement noise for a runner, in metres/second. */
const DEFAULT_PROCESS_NOISE = 3;

/** Accuracy assumed when a fix reports none. */
const FALLBACK_ACCURACY = 20;

export class GpsKalman {
  private lat = 0;
  private lng = 0;
  /** Current estimate variance, in metres squared. */
  private variance = -1;
  private timestamp = 0;
  private readonly processNoise: number;

  constructor(processNoiseMetresPerSecond: number = DEFAULT_PROCESS_NOISE) {
    this.processNoise = processNoiseMetresPerSecond;
  }

  reset() {
    this.variance = -1;
  }

  /** True once the filter has seen at least one fix. */
  get initialised(): boolean {
    return this.variance >= 0;
  }

  /**
   * Feed a raw fix in and get the smoothed position back.
   *
   * @param lng longitude of the raw fix
   * @param lat latitude of the raw fix
   * @param accuracy reported horizontal accuracy in metres
   * @param timestampMs fix time in epoch milliseconds
   */
  process(
    lng: number,
    lat: number,
    accuracy: number | null,
    timestampMs: number,
  ): [number, number] {
    const acc = Math.max(1, accuracy ?? FALLBACK_ACCURACY);

    if (this.variance < 0) {
      this.lat = lat;
      this.lng = lng;
      this.timestamp = timestampMs;
      this.variance = acc * acc;
      return [lng, lat];
    }

    // Predict: uncertainty grows with the time since the last fix.
    const dtSeconds = Math.max(0, (timestampMs - this.timestamp) / 1000);
    if (dtSeconds > 0) {
      this.variance += dtSeconds * this.processNoise * this.processNoise;
      this.timestamp = timestampMs;
    }

    // Update: blend prediction and measurement by their relative confidence.
    const gain = this.variance / (this.variance + acc * acc);
    this.lat += gain * (lat - this.lat);
    this.lng += gain * (lng - this.lng);
    this.variance = (1 - gain) * this.variance;

    return [this.lng, this.lat];
  }
}

/**
 * Distance to credit for a GPS gap, from the last known speed.
 *
 * Returns 0 unless we have a plausible speed and a plausible gap — we never
 * invent mileage from a stationary phone or from an hours-long suspension.
 *
 * @param speedMps speed reported by the fix, in metres/second
 * @param gapSeconds seconds since the last usable fix
 */
export function deadReckonDistance(
  speedMps: number | null | undefined,
  gapSeconds: number,
): number {
  if (speedMps == null || !Number.isFinite(speedMps)) return 0;
  // Below ~0.7 m/s is standing still or GPS noise; above 8 m/s (~3:20/km) is
  // not a fix we should trust to extrapolate from.
  if (speedMps < 0.7 || speedMps > 8) return 0;
  if (!Number.isFinite(gapSeconds) || gapSeconds <= 0 || gapSeconds > 60) return 0;
  return speedMps * gapSeconds;
}
