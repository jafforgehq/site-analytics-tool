// Traffic trajectory forecasting. Pure math on daily series - no network, no
// external ML dependencies - so it runs client-side on data the browser has
// already fetched and stays unit-testable.
//
// Model choice: Holt-Winters additive triple exponential smoothing with a
// weekly (7-day) season, which captures the trend + weekday/weekend rhythm
// that dominates site traffic. Smoothing parameters come from a small grid
// search minimizing one-step-ahead error on the observed series. Short series
// fall back to an ordinary least-squares line; very short series produce no
// forecast rather than a misleading one.

export interface SeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface ForecastPoint {
  date: string;
  value: number;
  lower: number; // 80% interval
  upper: number;
}

export type ForecastMethod = "holt-winters" | "linear";

export interface Forecast {
  method: ForecastMethod;
  points: ForecastPoint[];
  /** Sum of forecast values over the horizon. */
  horizonTotal: number;
  /** Fitted trend per day (change in daily value), for "trending +X/week" copy. */
  trendPerDay: number;
  /** One-step-ahead residual standard deviation on the observed series. */
  residualStd: number;
}

const SEASON = 7;
/** Minimum observations for Holt-Winters (3 full weekly seasons). */
const MIN_HW = SEASON * 3;
/** Minimum observations for the linear fallback. */
const MIN_LINEAR = 8;
/** 80% two-sided normal quantile. */
const Z80 = 1.2816;

const DAY_MS = 86_400_000;

function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Normalize raw rows into a contiguous daily series: sort by date, then fill
 * interior gaps (missed sync days) by linear interpolation so the seasonal
 * fit is not thrown off. Leading/trailing gaps are not invented.
 */
export function toContiguousSeries(rows: SeriesPoint[]): SeriesPoint[] {
  if (rows.length === 0) return [];
  const byDate = new Map<string, number>();
  for (const row of rows) {
    if (Number.isFinite(row.value)) byDate.set(row.date, row.value);
  }
  const dates = [...byDate.keys()].sort();
  if (dates.length === 0) return [];

  const out: SeriesPoint[] = [];
  const first = dates[0];
  const last = dates[dates.length - 1];
  let prevKnownIdx = -1;
  const totalDays = Math.round(
    (Date.parse(`${last}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) /
      DAY_MS,
  );
  for (let i = 0; i <= totalDays; i += 1) {
    const date = addDays(first, i);
    const known = byDate.get(date);
    if (known != null) {
      // Interpolate any gap between the previous known point and this one.
      if (prevKnownIdx >= 0 && out.length - 1 > prevKnownIdx) {
        const prev = out[prevKnownIdx];
        const span = out.length - prevKnownIdx;
        for (let g = prevKnownIdx + 1; g < out.length; g += 1) {
          const frac = (g - prevKnownIdx) / span;
          out[g] = {
            date: out[g].date,
            value: prev.value + (known - prev.value) * frac,
          };
        }
      }
      out.push({ date, value: known });
      prevKnownIdx = out.length - 1;
    } else {
      out.push({ date, value: NaN }); // placeholder, interpolated above
    }
  }
  return out;
}

interface HwFit {
  level: number;
  trend: number;
  seasonals: number[];
  sse: number;
  n: number;
}

function fitHoltWinters(
  values: number[],
  alpha: number,
  beta: number,
  gamma: number,
): HwFit {
  // Initialize from the first two seasons.
  const seasons = Math.floor(values.length / SEASON);
  const firstAvg = values.slice(0, SEASON).reduce((a, b) => a + b, 0) / SEASON;
  const secondAvg =
    values.slice(SEASON, SEASON * 2).reduce((a, b) => a + b, 0) / SEASON;

  let level = firstAvg;
  let trend = (secondAvg - firstAvg) / SEASON;

  // Initial seasonal indices: average deviation from each season's mean.
  const seasonals = new Array<number>(SEASON).fill(0);
  for (let s = 0; s < SEASON; s += 1) {
    let sum = 0;
    for (let k = 0; k < seasons; k += 1) {
      const seasonSlice = values.slice(k * SEASON, (k + 1) * SEASON);
      const seasonAvg = seasonSlice.reduce((a, b) => a + b, 0) / SEASON;
      sum += values[k * SEASON + s] - seasonAvg;
    }
    seasonals[s] = sum / seasons;
  }

  let sse = 0;
  let n = 0;
  for (let i = 0; i < values.length; i += 1) {
    const s = i % SEASON;
    const predicted = level + trend + seasonals[s];
    const err = values[i] - predicted;
    if (i >= SEASON) {
      sse += err * err;
      n += 1;
    }
    const lastLevel = level;
    level = alpha * (values[i] - seasonals[s]) + (1 - alpha) * (level + trend);
    trend = beta * (level - lastLevel) + (1 - beta) * trend;
    seasonals[s] = gamma * (values[i] - level) + (1 - gamma) * seasonals[s];
  }

  return { level, trend, seasonals, sse, n };
}

const ALPHAS = [0.15, 0.3, 0.5];
const BETAS = [0.01, 0.05, 0.15];
const GAMMAS = [0.05, 0.2, 0.4];

function bestHoltWinters(values: number[]): HwFit {
  let best: HwFit | null = null;
  for (const alpha of ALPHAS) {
    for (const beta of BETAS) {
      for (const gamma of GAMMAS) {
        const fit = fitHoltWinters(values, alpha, beta, gamma);
        if (!best || fit.sse < best.sse) best = fit;
      }
    }
  }
  return best!;
}

function linearFit(values: number[]): {
  intercept: number;
  slope: number;
  residualStd: number;
} {
  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - meanX) * (values[i] - meanY);
    den += (i - meanX) * (i - meanX);
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  let sse = 0;
  for (let i = 0; i < n; i += 1) {
    const err = values[i] - (intercept + slope * i);
    sse += err * err;
  }
  const residualStd = Math.sqrt(sse / Math.max(1, n - 2));
  return { intercept, slope, residualStd };
}

/**
 * Forecast `horizonDays` beyond the end of the series. Returns null when there
 * is not enough history to say anything honest (fewer than 8 observed days).
 * Values are clamped at zero - traffic cannot be negative.
 */
export function forecastSeries(
  rows: SeriesPoint[],
  horizonDays: number,
): Forecast | null {
  const series = toContiguousSeries(rows);
  if (series.length < MIN_LINEAR || horizonDays <= 0) return null;
  const values = series.map((p) => p.value);
  const lastDate = series[series.length - 1].date;

  if (series.length >= MIN_HW) {
    const fit = bestHoltWinters(values);
    const residualStd = Math.sqrt(fit.sse / Math.max(1, fit.n));
    const points: ForecastPoint[] = [];
    let total = 0;
    for (let h = 1; h <= horizonDays; h += 1) {
      const s = (values.length + h - 1) % SEASON;
      const value = Math.max(0, fit.level + fit.trend * h + fit.seasonals[s]);
      // SES-style variance growth approximation - honest widening without
      // pretending to a full HW prediction-interval derivation.
      const spread = Z80 * residualStd * Math.sqrt(1 + (h - 1) * 0.05);
      points.push({
        date: addDays(lastDate, h),
        value,
        lower: Math.max(0, value - spread),
        upper: value + spread,
      });
      total += value;
    }
    return {
      method: "holt-winters",
      points,
      horizonTotal: total,
      trendPerDay: fit.trend,
      residualStd,
    };
  }

  const { intercept, slope, residualStd } = linearFit(values);
  const points: ForecastPoint[] = [];
  let total = 0;
  for (let h = 1; h <= horizonDays; h += 1) {
    const value = Math.max(0, intercept + slope * (values.length - 1 + h));
    const spread = Z80 * residualStd * Math.sqrt(1 + (h - 1) * 0.05);
    points.push({
      date: addDays(lastDate, h),
      value,
      lower: Math.max(0, value - spread),
      upper: value + spread,
    });
    total += value;
  }
  return {
    method: "linear",
    points,
    horizonTotal: total,
    trendPerDay: slope,
    residualStd,
  };
}
