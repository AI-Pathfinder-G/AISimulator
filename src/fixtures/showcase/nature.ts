// 나무·바위 (반복 모델 재사용). 고정 seed.
import { mulberry32 } from '../../shared/rng';
import { MAIN_ROAD, RIVER, VILLAGE_CENTERS, distToPolyline, BATTLE_FIELD, LAUNCH_PAD } from '../../world3d/terrain/layout';
import { isWater, slopeAt, terrainHeight } from '../../world3d/terrain/heightmap';
import type { NatureItem } from './baseScene';
import { SHOWCASE_SEED } from './baseScene';

export function createNature(target = 160): NatureItem[] {
  const rng = mulberry32(SHOWCASE_SEED + 77);
  const out: NatureItem[] = [];
  let tries = 0;
  // 숲 군집 중심
  const groves = [
    { x: -30, z: -12 }, { x: -12, z: -18 }, { x: 30, z: 14 }, { x: 36, z: -14 }, { x: -36, z: 14 }, { x: 14, z: -18 }, { x: -10, z: 20 }, { x: 22, z: 22 },
  ];
  while (out.length < target && tries < 20000) {
    tries++;
    const g = groves[Math.floor(rng() * groves.length)];
    const spread = 9;
    const x = rng() < 0.75 ? g.x + (rng() - 0.5) * 2 * spread : (rng() - 0.5) * 88;
    const z = rng() < 0.75 ? g.z + (rng() - 0.5) * 2 * spread : (rng() - 0.5) * 58;
    if (isWater(x, z) || terrainHeight(x, z) < 0.5) continue;
    if (slopeAt(x, z) > 1.1) continue;
    if (Object.values(VILLAGE_CENTERS).some((c) => Math.hypot(x - c.x, z - c.z) < 19.5)) continue;
    if (distToPolyline({ x, z }, MAIN_ROAD) < 3) continue;
    if (distToPolyline({ x, z }, RIVER) < 3.6) continue;
    if (Math.hypot(x - BATTLE_FIELD.x, z - BATTLE_FIELD.z) < 7) continue;
    if (Math.hypot(x - LAUNCH_PAD.x, z - LAUNCH_PAD.z) < 3) continue;
    if (out.some((o) => Math.hypot(o.x - x, o.z - z) < 1.3)) continue;
    const r = rng();
    const kind: NatureItem['kind'] = r < 0.42 ? 'tree' : r < 0.66 ? 'tree-high' : r < 0.8 ? 'tree-crooked' : r < 0.88 ? 'rock-large' : r < 0.95 ? 'rock-small' : 'rock-wide';
    out.push({ id: `n-${out.length}`, kind, x, z, rot: rng() * Math.PI * 2, scale: 0.9 + rng() * 0.5 });
  }
  return out;
}

export function natureRadius(n: NatureItem): number {
  return (n.kind.startsWith('rock') ? 0.7 : 0.35) * n.scale;
}
