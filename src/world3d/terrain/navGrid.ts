// 작은 이동 격자 + A* (설계문서 5.3). 물·건물 발자국·가파른 면·울타리는 통행 불가, 다리는 통행 가능.
import type { BuildingView, Vec2 } from '../../shared/render-contracts';
import { GRID_H, GRID_W, NAV_CELL, cellToWorld, inGrid, worldToCell, type GridCell } from './coords';
import { isWater, slopeAt } from './heightmap';
import { MAIN_ROAD, ROAD_HALF, distToPolyline, onBridge } from './layout';
import { frontDir, rotatedSize, type FenceSegment, type NatureItem } from '../../fixtures/showcase/baseScene';
import { natureRadius } from '../../fixtures/showcase/nature';

export const MAX_WALK_SLOPE = 1.0;
export const BUILDING_MARGIN = 0.25;

export type BlockReason = 0 | 1 | 2 | 3 | 4 | 5; // 0 통행, 1 물, 2 경사, 3 건물, 4 자연물, 5 울타리

export class NavGrid {
  readonly w = GRID_W;
  readonly h = GRID_H;
  readonly block: Uint8Array;
  readonly cost: Float32Array;

  constructor(block: Uint8Array, cost: Float32Array) {
    this.block = block;
    this.cost = cost;
  }

  idx(c: GridCell): number { return c.y * this.w + c.x; }

  walkableCell(c: GridCell): boolean { return inGrid(c) && this.block[this.idx(c)] === 0; }

  walkable(p: Vec2): boolean { return this.walkableCell(worldToCell(p)); }

  reason(p: Vec2): BlockReason {
    const c = worldToCell(p);
    return inGrid(c) ? (this.block[this.idx(c)] as BlockReason) : 1;
  }

  /** 두 점 사이 직선이 지나는 모든 격자 셀이 통행 가능한지 (격자 순회, 모서리 스침도 검사) */
  lineWalkable(a: Vec2, b: Vec2): boolean {
    const ca = worldToCell(a), cb = worldToCell(b);
    if (!this.walkableCell(ca) || !this.walkableCell(cb)) return false;
    const ox = -this.w * NAV_CELL / 2, oz = -this.h * NAV_CELL / 2;
    const ax = (a.x - ox) / NAV_CELL, az = (a.z - oz) / NAV_CELL, bx = (b.x - ox) / NAV_CELL, bz = (b.z - oz) / NAV_CELL;
    const dx = bx - ax, dz = bz - az;
    let x = ca.x, y = ca.y;
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0, stepY = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const tDeltaX = stepX ? Math.abs(1 / dx) : Infinity, tDeltaY = stepY ? Math.abs(1 / dz) : Infinity;
    let tMaxX = stepX > 0 ? (Math.floor(ax) + 1 - ax) * tDeltaX : stepX < 0 ? (ax - Math.floor(ax)) * tDeltaX : Infinity;
    let tMaxY = stepY > 0 ? (Math.floor(az) + 1 - az) * tDeltaY : stepY < 0 ? (az - Math.floor(az)) * tDeltaY : Infinity;
    let guard = 0;
    while ((x !== cb.x || y !== cb.y) && guard++ < 4000) {
      if (Math.abs(tMaxX - tMaxY) < 1e-9) {
        // 정확히 모서리를 지나면 양 옆 셀 모두 검사
        if (!this.walkableCell({ x: x + stepX, y }) || !this.walkableCell({ x, y: y + stepY })) return false;
        x += stepX; y += stepY; tMaxX += tDeltaX; tMaxY += tDeltaY;
      } else if (tMaxX < tMaxY) { x += stepX; tMaxX += tDeltaX; } else { y += stepY; tMaxY += tDeltaY; }
      if (!this.walkableCell({ x, y })) return false;
    }
    return true;
  }

  /** p 근처에서 가장 가까운 통행 가능 지점 */
  nearestWalkable(p: Vec2, maxRadius = 4): Vec2 | null {
    if (this.walkable(p)) return p;
    const c0 = worldToCell(p);
    const rMax = Math.ceil(maxRadius / NAV_CELL);
    for (let r = 1; r <= rMax; r++) {
      let best: GridCell | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const c = { x: c0.x + dx, y: c0.y + dy };
        if (!this.walkableCell(c)) continue;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = c; }
      }
      if (best) return cellToWorld(best);
    }
    return null;
  }

  /** A* (8방향, 모서리 자르기 금지). 경로가 없으면 null — 직선 관통으로 대체하지 않는다. */
  findPath(from: Vec2, to: Vec2, maxExpand = 60000): Vec2[] | null {
    const s = worldToCell(from), g = worldToCell(to);
    if (!this.walkableCell(s) || !this.walkableCell(g)) return null;
    const W = this.w;
    const start = this.idx(s), goal = this.idx(g);
    const gScore = new Float32Array(W * this.h).fill(Infinity);
    const came = new Int32Array(W * this.h).fill(-1);
    const closed = new Uint8Array(W * this.h);
    const heap = new MinHeap();
    const hfn = (i: number) => {
      const dx = Math.abs((i % W) - g.x), dy = Math.abs(Math.floor(i / W) - g.y);
      return 0.7 * (Math.max(dx, dy) + 0.414 * Math.min(dx, dy));
    };
    gScore[start] = 0;
    heap.push(start, hfn(start));
    let expanded = 0;
    while (heap.size > 0) {
      const cur = heap.pop();
      if (cur === goal) break;
      if (closed[cur]) continue;
      closed[cur] = 1;
      if (++expanded > maxExpand) return null;
      const cx = cur % W, cy = (cur - cx) / W;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= this.h) continue;
        const ni = ny * W + nx;
        if (this.block[ni] || closed[ni]) continue;
        if (dx && dy && (this.block[cy * W + nx] || this.block[ny * W + cx])) continue; // 모서리 자르기 금지
        const step = (dx && dy ? 1.4142 : 1) * this.cost[ni];
        const ng = gScore[cur] + step;
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + hfn(ni));
        }
      }
    }
    if (start !== goal && came[goal] === -1) return null;
    const cells: Vec2[] = [];
    for (let i = goal; i !== -1; i = came[i]) {
      cells.push(cellToWorld({ x: i % W, y: Math.floor(i / W) }));
      if (i === start) break;
    }
    cells.reverse();
    // 시작/끝 셀 중심을 남겨 두어 셀 내부 이동만 추가 (모서리 스침 방지)
    cells.unshift({ ...from });
    cells.push({ ...to });
    return this.smooth(cells);
  }

  /** 시야 기반 경로 단순화 (장애물 통과 금지 유지) */
  smooth(path: Vec2[]): Vec2[] {
    if (path.length <= 2) return path;
    const out: Vec2[] = [path[0]];
    let anchor = 0;
    while (anchor < path.length - 1) {
      let next = anchor + 1;
      for (let j = path.length - 1; j > anchor + 1; j--) {
        if (this.lineWalkable(path[anchor], path[j])) { next = j; break; }
      }
      out.push(path[next]);
      anchor = next;
    }
    return out;
  }
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];
  get size() { return this.items.length; }
  push(item: number, p: number) {
    const a = this.items, q = this.prio;
    a.push(item); q.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (q[parent] <= q[i]) break;
      [a[parent], a[i]] = [a[i], a[parent]]; [q[parent], q[i]] = [q[i], q[parent]];
      i = parent;
    }
  }
  pop(): number {
    const a = this.items, q = this.prio;
    const top = a[0];
    const li = a.pop()!, lp = q.pop()!;
    if (a.length > 0) {
      a[0] = li; q[0] = lp;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && q[l] < q[m]) m = l;
        if (r < a.length && q[r] < q[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; [q[m], q[i]] = [q[i], q[m]];
        i = m;
      }
    }
    return top;
  }
}

/** 건물 발자국 사각형 (여유 포함) */
export function footprintRect(b: BuildingView, margin = BUILDING_MARGIN) {
  const s = rotatedSize(b);
  return { minX: b.position.x - s.w / 2 - margin, maxX: b.position.x + s.w / 2 + margin, minZ: b.position.z - s.d / 2 - margin, maxZ: b.position.z + s.d / 2 + margin };
}

/** 밭 울타리: 마을 반대쪽 세 면 (마을 쪽은 열려 있음) */
export function farmFences(b: BuildingView): FenceSegment[] {
  const s = rotatedSize(b);
  const hx = s.w / 2, hz = s.d / 2, { x, z } = b.position;
  const corners = { nw: { x: x - hx, z: z - hz }, ne: { x: x + hx, z: z - hz }, se: { x: x + hx, z: z + hz }, sw: { x: x - hx, z: z + hz } };
  const f = frontDir(b.rotationQuarter);
  const sides: Record<string, FenceSegment> = {
    n: { a: corners.nw, b: corners.ne }, s: { a: corners.sw, b: corners.se }, e: { a: corners.ne, b: corners.se }, w: { a: corners.nw, b: corners.sw },
  };
  const open = f.z < 0 ? 'n' : f.z > 0 ? 's' : f.x > 0 ? 'e' : 'w';
  return Object.entries(sides).filter(([k]) => k !== open).map(([, v]) => v);
}

export interface CircleObstacle { x: number; z: number; r: number }

export function buildNavGrid(buildings: BuildingView[], nature: NatureItem[], circles: CircleObstacle[] = []): NavGrid {
  const block = new Uint8Array(GRID_W * GRID_H);
  const cost = new Float32Array(GRID_W * GRID_H).fill(1);
  for (let y = 0; y < GRID_H; y++) for (let x = 0; x < GRID_W; x++) {
    const p = cellToWorld({ x, y });
    const i = y * GRID_W + x;
    if (isWater(p.x, p.z)) block[i] = 1;
    else if (!onBridge(p.x, p.z) && slopeAt(p.x, p.z) > MAX_WALK_SLOPE) block[i] = 2;
    if (distToPolyline(p, MAIN_ROAD) < ROAD_HALF) cost[i] = 0.7;
  }
  const stamp = (minX: number, maxX: number, minZ: number, maxZ: number, reason: BlockReason) => {
    const a = worldToCell({ x: minX, z: minZ }), b = worldToCell({ x: maxX, z: maxZ });
    for (let y = Math.max(0, a.y); y <= Math.min(GRID_H - 1, b.y); y++) for (let x = Math.max(0, a.x); x <= Math.min(GRID_W - 1, b.x); x++) {
      if (!block[y * GRID_W + x]) block[y * GRID_W + x] = reason;
    }
  };
  for (const b of buildings) {
    if (b.kind === 'farm') {
      for (const seg of farmFences(b)) stamp(Math.min(seg.a.x, seg.b.x) - 0.1, Math.max(seg.a.x, seg.b.x) + 0.1, Math.min(seg.a.z, seg.b.z) - 0.1, Math.max(seg.a.z, seg.b.z) + 0.1, 5);
      continue;
    }
    const r = footprintRect(b);
    stamp(r.minX, r.maxX, r.minZ, r.maxZ, 3);
  }
  for (const n of nature) {
    const r = natureRadius(n);
    stamp(n.x - r, n.x + r, n.z - r, n.z + r, 4);
  }
  for (const c of circles) {
    const a = worldToCell({ x: c.x - c.r, z: c.z - c.r }), b = worldToCell({ x: c.x + c.r, z: c.z + c.r });
    for (let y = a.y; y <= b.y; y++) for (let x = a.x; x <= b.x; x++) {
      const p = cellToWorld({ x, y });
      if (inGrid({ x, y }) && Math.hypot(p.x - c.x, p.z - c.z) <= c.r && !block[y * GRID_W + x]) block[y * GRID_W + x] = 3;
    }
  }
  return new NavGrid(block, cost);
}
