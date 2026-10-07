// 지면 높이 샘플 함수. 렌더 지형과 보행 높이가 같은 함수를 쓴다 (설계문서 5.3).
import { valueNoise } from '../../shared/rng';
import {
  BRIDGE_Y, HILLS, MAIN_ROAD, RIVER, RIVER_BANK_HALF, RIVER_WATER_HALF, ROAD_HALF, TOWN_GROUND,
  VILLAGE_CENTERS, VILLAGE_FLAT_INNER, VILLAGE_FLAT_OUTER, distToPolyline, onBridge,
} from './layout';

export const TERRAIN_SEED = 1207;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** 섬 마스크 0(바다)~1(육지) */
export function landMask(x: number, z: number): number {
  const d = Math.sqrt((x / 45) ** 2 + (z / 30) ** 2) + (valueNoise(x * 0.08, z * 0.08, TERRAIN_SEED) - 0.5) * 0.12;
  return 1 - smoothstep(0.8, 0.97, d);
}

/** 원 지형 높이 (물 아래 포함). 다리 상판은 포함하지 않음 */
export function terrainHeight(x: number, z: number): number {
  const land = landMask(x, z);
  let h = -1.6 + land * (TOWN_GROUND + 1.6);
  for (const hill of HILLS) {
    const d2 = (x - hill.x) ** 2 + (z - hill.z) ** 2;
    h += hill.h * Math.exp(-d2 / (2 * hill.s * hill.s)) * land;
  }
  h += (valueNoise(x * 0.18, z * 0.18, TERRAIN_SEED + 1) - 0.5) * 0.45 * land;

  for (const c of Object.values(VILLAGE_CENTERS)) {
    const d = Math.hypot(x - c.x, z - c.z);
    h = lerp(h, TOWN_GROUND, (1 - smoothstep(VILLAGE_FLAT_INNER, VILLAGE_FLAT_OUTER, d)) * land);
  }
  const dRoad = distToPolyline({ x, z }, MAIN_ROAD);
  h = lerp(h, TOWN_GROUND, (1 - smoothstep(ROAD_HALF + 0.6, ROAD_HALF + 3, dRoad)) * land);

  const dRiver = distToPolyline({ x, z }, RIVER);
  const carve = 1 - smoothstep(RIVER_WATER_HALF, RIVER_BANK_HALF, dRiver);
  h = lerp(h, -0.8, carve);
  return h;
}

/** 보행/배치 기준 높이: 다리 위면 상판 높이 */
export function groundY(x: number, z: number): number {
  if (onBridge(x, z)) return Math.max(BRIDGE_Y, terrainHeight(x, z));
  return Math.max(terrainHeight(x, z), 0);
}

export function isWater(x: number, z: number): boolean {
  return terrainHeight(x, z) < 0.12 && !onBridge(x, z);
}

/** 경사 크기 (단위 거리당 높이 변화) */
export function slopeAt(x: number, z: number, e = 0.35): number {
  const dx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
  const dz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
}
