/** Rolling frame-time stats for the pasture, especially low-end (DPR 1) runs. */

export const FRAME_BUDGET_MS = 1000 / 60;
export const FRAME_SAMPLE_WINDOW = 120;

export type FrameSampleSummary = {
  samples: number;
  avgMs: number;
  maxMs: number;
  overBudget: number;
};

export type RendererInfoSnapshot = {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
};

export type FrameStatsReport = FrameSampleSummary &
  RendererInfoSnapshot & {
    dpr: number;
    preferPerf: boolean;
  };

export const EMPTY_RENDERER_INFO: RendererInfoSnapshot = {
  drawCalls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
};

export function summarizeFrameTimes(
  deltasMs: readonly number[],
  budgetMs = FRAME_BUDGET_MS,
): FrameSampleSummary {
  if (!deltasMs.length) {
    return { samples: 0, avgMs: 0, maxMs: 0, overBudget: 0 };
  }
  let total = 0;
  let maxMs = 0;
  let overBudget = 0;
  for (const delta of deltasMs) {
    total += delta;
    if (delta > maxMs) maxMs = delta;
    if (delta > budgetMs) overBudget += 1;
  }
  return {
    samples: deltasMs.length,
    avgMs: total / deltasMs.length,
    maxMs,
    overBudget,
  };
}

export type FrameSampler = {
  tick: (nowMs: number) => void;
  summary: () => FrameSampleSummary;
  reset: () => void;
};

export function createFrameSampler(
  windowSize = FRAME_SAMPLE_WINDOW,
  budgetMs = FRAME_BUDGET_MS,
): FrameSampler {
  const deltas: number[] = [];
  let last = 0;
  return {
    tick(nowMs: number) {
      if (last > 0) {
        deltas.push(nowMs - last);
        if (deltas.length > windowSize) deltas.shift();
      }
      last = nowMs;
    },
    summary() {
      return summarizeFrameTimes(deltas, budgetMs);
    },
    reset() {
      deltas.length = 0;
      last = 0;
    },
  };
}
