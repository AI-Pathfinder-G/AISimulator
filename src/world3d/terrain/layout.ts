// 섬의 고정 배치. 지형보다 도시·농장·도로·다리 위치를 먼저 정한다 (설계문서 5.1).
import type { Vec2 } from '../../shared/render-contracts';

export const MAP_WIDTH = 96; // x: -48..48
export const MAP_DEPTH = 64; // z: -32..32
export const WATER_LEVEL = 0;
export const TOWN_GROUND = 1.0;
export const BRIDGE_Y = 1.18;

export const VILLAGE_CENTERS: Record<string, Vec2> = {
  west: { x: -22, z: 2 },
  east: { x: 22, z: 0 },
};
export const VILLAGE_FLAT_INNER = 14;
export const VILLAGE_FLAT_OUTER = 18;

/** 강 중심선 (북→남) */
export const RIVER: Vec2[] = [
  { x: 5, z: -36 }, { x: 3, z: -22 }, { x: -1, z: -10 }, { x: 0, z: 2 },
  { x: 3, z: 12 }, { x: 1, z: 22 }, { x: -2, z: 36 },
];
export const RIVER_WATER_HALF = 1.5;
export const RIVER_BANK_HALF = 3.4;

/** 다리: 축 정렬 사각형 */
export const BRIDGE = { minX: -4.2, maxX: 4.2, minZ: 1.0, maxZ: 3.0 };

/** 두 마을을 잇는 주 도로 */
export const MAIN_ROAD: Vec2[] = [
  { x: -15, z: 2 }, { x: -9, z: 2 }, { x: -4.2, z: 2 }, { x: 4.2, z: 2 }, { x: 9, z: 1.5 }, { x: 15, z: 0.5 },
];
export const ROAD_HALF = 1.0;

export const HILLS: Array<{ x: number; z: number; h: number; s: number }> = [
  { x: -32, z: -18, h: 5.5, s: 6.5 },
  { x: -12, z: -22, h: 3.2, s: 5 },
  { x: 33, z: 19, h: 5, s: 6.5 },
  { x: 14, z: 23, h: 2.8, s: 4.5 },
  { x: 36, z: -19, h: 4, s: 5.5 },
  { x: -36, z: 18, h: 3, s: 5 },
];

/** 시험 전투가 벌어지는 들판 (강 동쪽 남부) */
export const BATTLE_FIELD: Vec2 = { x: 10, z: 12 };
/** 시험 미사일 발사대 (동쪽 언덕 기슭) */
export const LAUNCH_PAD: Vec2 = { x: 32, z: -9 };

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = a.x + t * dx - p.x, qz = a.z + t * dz - p.z;
  return Math.sqrt(qx * qx + qz * qz);
}

export function distToPolyline(p: Vec2, line: Vec2[]): number {
  let d = Infinity;
  for (let i = 0; i < line.length - 1; i++) d = Math.min(d, distToSegment(p, line[i], line[i + 1]));
  return d;
}

export function onBridge(x: number, z: number): boolean {
  return x >= BRIDGE.minX && x <= BRIDGE.maxX && z >= BRIDGE.minZ && z <= BRIDGE.maxZ;
}
