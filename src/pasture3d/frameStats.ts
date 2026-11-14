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
  programs: number;
  lights: number;
  shadowCasters: number;
  transparent: number;
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
  programs: 0,
  lights: 0,
  shadowCasters: 0,
  transparent: 0,
};

type SceneObjectLike = {
  type?: unknown;
  castShadow?: unknown;
  isMesh?: unknown;
  isInstancedMesh?: unknown;
  material?: unknown;
};

type SceneLike = {
  // Parameter is wide so Three's Object3D traverse remains assignable.
  traverse: (cb: (obj: object) => void) => void;
};

/** Count lights, shadow casters, and transparent materials in a Three scene. */
export function collectSceneStats(scene: SceneLike | null | undefined): {
  lights: number;
  shadowCasters: number;
  transparent: number;
} {
  const stats = { lights: 0, shadowCasters: 0, transparent: 0 };
  if (!scene) return stats;
  scene.traverse((raw) => {
    const obj = raw as SceneObjectLike;
    const type = String(obj.type ?? "");
    if (type.includes("Light")) stats.lights += 1;
    if (
      obj.castShadow === true &&
      (obj.isMesh === true || obj.isInstancedMesh === true)
    ) {
      stats.shadowCasters += 1;
    }
    const mat = obj.material as
      { transparent?: boolean } | Array<{ transparent?: boolean }> | undefined;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    if (mats.some((item) => item.transparent)) stats.transparent += 1;
  });
  return stats;
}

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
