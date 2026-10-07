// V01 좌표/높이, V02 통행 불가·다리·경로 없음
import { describe, expect, it } from 'vitest';
import { cellToWorld, worldToCell, GRID_W, GRID_H, logicCellOf } from '../../src/world3d/terrain/coords';
import { groundY, isWater, terrainHeight } from '../../src/world3d/terrain/heightmap';
import { BRIDGE, BRIDGE_Y, RIVER, VILLAGE_CENTERS, MAP_WIDTH, MAP_DEPTH } from '../../src/world3d/terrain/layout';
import { buildNavGrid, footprintRect } from '../../src/world3d/terrain/navGrid';
import { createShowcaseFixture, doorPoint } from '../../src/fixtures/showcase/baseScene';
import { createNature } from '../../src/fixtures/showcase/nature';

const fx = createShowcaseFixture();
const nature = createNature();
const nav = buildNavGrid(fx.buildings, nature);

describe('V01 좌표 변환과 지면 높이', () => {
  it('격자↔월드 변환이 왕복 일치한다', () => {
    for (const c of [{ x: 0, y: 0 }, { x: 10, y: 77 }, { x: GRID_W - 1, y: GRID_H - 1 }]) {
      expect(worldToCell(cellToWorld(c))).toEqual(c);
    }
    const p = cellToWorld({ x: 0, y: 0 });
    expect(p.x).toBeCloseTo(-MAP_WIDTH / 2 + 0.25);
    expect(p.z).toBeCloseTo(-MAP_DEPTH / 2 + 0.25);
  });
  it('원본 12×8 논리 격자는 렌더 격자와 별개로 경계 안에 고정된다', () => {
    expect(logicCellOf({ x: -48, z: -32 })).toEqual({ x: 0, y: 0 });
    expect(logicCellOf({ x: 47.9, z: 31.9 })).toEqual({ x: 11, y: 7 });
    expect(logicCellOf({ x: 999, z: -999 })).toEqual({ x: 11, y: 0 });
  });
  it('마을 부지는 평탄하고 바다는 수면 아래, 강은 물이다', () => {
    for (const c of Object.values(VILLAGE_CENTERS)) {
      for (const [dx, dz] of [[0, 0], [6, 0], [0, -6], [-5, 5]]) expect(terrainHeight(c.x + dx, c.z + dz)).toBeCloseTo(1, 0);
    }
    expect(terrainHeight(-47, -31)).toBeLessThan(0);
    expect(isWater(RIVER[2].x, RIVER[2].z)).toBe(true);
  });
  it('다리 위 보행 높이는 상판, 다리 밖 강은 수면 이상', () => {
    const mid = { x: 0, z: (BRIDGE.minZ + BRIDGE.maxZ) / 2 };
    expect(groundY(mid.x, mid.z)).toBeCloseTo(BRIDGE_Y);
    expect(isWater(mid.x, mid.z)).toBe(false);
    expect(groundY(RIVER[2].x, RIVER[2].z)).toBe(0);
  });
  it('지면 높이 함수는 연속적이다 (큰 점프 없음)', () => {
    for (let x = -40; x < 40; x += 1.3) for (let z = -26; z < 26; z += 1.7) {
      expect(Math.abs(terrainHeight(x + 0.05, z) - terrainHeight(x, z))).toBeLessThan(0.3);
    }
  });
});

describe('V02 통행 격자와 경로', () => {
  it('물·건물 발자국은 막히고 다리는 통행 가능', () => {
    expect(nav.walkable({ x: RIVER[2].x, z: RIVER[2].z })).toBe(false);
    expect(nav.walkable({ x: 0, z: 2 })).toBe(true);
    const hall = fx.buildings.find((b) => b.kind === 'hall')!;
    expect(nav.walkable(hall.position)).toBe(false);
    expect(nav.reason(hall.position)).toBe(3);
  });
  it('모든 건물 문 앞은 걸어서 갈 수 있다', () => {
    for (const b of fx.buildings.filter((b) => b.kind !== 'farm')) {
      const d = nav.nearestWalkable(doorPoint(b), 1.5);
      expect(d, b.id).not.toBeNull();
    }
  });
  it('두 마을 사이 경로는 강을 직선 횡단하지 않고 다리를 지난다', () => {
    const path = nav.findPath(VILLAGE_CENTERS.west, VILLAGE_CENTERS.east)!;
    expect(path).not.toBeNull();
    // 세밀 샘플링: 모든 점이 통행 가능
    for (let i = 0; i < path.length - 1; i++) expect(nav.lineWalkable(path[i], path[i + 1])).toBe(true);
    // 강 중심선(x≈0)을 넘는 구간은 다리 범위 안
    let crossed = false;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      if ((a.x - 0) * (b.x - 0) <= 0 && a.x !== b.x) {
        const t = (0 - a.x) / (b.x - a.x);
        const z = a.z + (b.z - a.z) * t;
        expect(z).toBeGreaterThanOrEqual(BRIDGE.minZ);
        expect(z).toBeLessThanOrEqual(BRIDGE.maxZ);
        crossed = true;
      }
    }
    expect(crossed).toBe(true);
  });
  it('목적지가 막혀 있거나 고립되면 null (직선 관통으로 대체하지 않음)', () => {
    const hall = fx.buildings.find((b) => b.kind === 'hall')!;
    expect(nav.findPath(VILLAGE_CENTERS.west, hall.position)).toBeNull();
    expect(nav.findPath(VILLAGE_CENTERS.west, { x: -47, z: -31 })).toBeNull(); // 바다
  });
  it('발자국 사각형은 여유를 포함한다', () => {
    const b = fx.buildings[0];
    const r = footprintRect(b, 0);
    expect(r.maxX - r.minX).toBeGreaterThan(1);
  });
});
