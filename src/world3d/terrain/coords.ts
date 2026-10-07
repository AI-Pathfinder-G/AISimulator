// 원본 격자(cell.x, cell.y) ↔ 그래픽 좌표(x, z) 변환을 한곳에서 관리 (설계문서 4.4).
import { MAP_DEPTH, MAP_WIDTH } from './layout';
import type { Vec2 } from '../../shared/render-contracts';

export interface GridCell { x: number; y: number }

export const NAV_CELL = 0.5;
export const GRID_W = Math.round(MAP_WIDTH / NAV_CELL);
export const GRID_H = Math.round(MAP_DEPTH / NAV_CELL);

export function cellToWorld(cell: GridCell): Vec2 {
  return { x: -MAP_WIDTH / 2 + (cell.x + 0.5) * NAV_CELL, z: -MAP_DEPTH / 2 + (cell.y + 0.5) * NAV_CELL };
}

export function worldToCell(p: Vec2): GridCell {
  return { x: Math.floor((p.x + MAP_WIDTH / 2) / NAV_CELL), y: Math.floor((p.z + MAP_DEPTH / 2) / NAV_CELL) };
}

export function inGrid(c: GridCell): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < GRID_W && c.y < GRID_H;
}

/** 원본 12×8 논리 격자 셀 (경제/영토용; 렌더 해상도와 별개) */
export const LOGIC_W = 12;
export const LOGIC_H = 8;
export function logicCellOf(p: Vec2): GridCell {
  return {
    x: Math.min(LOGIC_W - 1, Math.max(0, Math.floor(((p.x + MAP_WIDTH / 2) / MAP_WIDTH) * LOGIC_W))),
    y: Math.min(LOGIC_H - 1, Math.max(0, Math.floor(((p.z + MAP_DEPTH / 2) / MAP_DEPTH) * LOGIC_H))),
  };
}
