// 건물 상태 전이 (설계문서 6.2)
//  planned → constructing → active → damaged → ruined
//                             ↑          │         │
//                             └──── repairing ─────┘
import type { BuildingStatus } from '../../shared/render-contracts';

const ALLOWED: Record<BuildingStatus, BuildingStatus[]> = {
  planned: ['constructing'],
  constructing: ['active', 'damaged', 'ruined'],
  active: ['damaged', 'ruined'],
  damaged: ['ruined', 'repairing'],
  ruined: ['repairing'],
  repairing: ['active', 'damaged', 'ruined'],
};

export function canTransition(from: BuildingStatus, to: BuildingStatus): boolean {
  return ALLOWED[from].includes(to);
}

/** 시험 미사일 명중 시 다음 상태 */
export function statusAfterHit(s: BuildingStatus): BuildingStatus {
  switch (s) {
    case 'active': return 'damaged';
    case 'constructing': return 'damaged';
    case 'planned': return 'planned';
    case 'damaged': return 'ruined';
    case 'repairing': return 'ruined';
    case 'ruined': return 'ruined';
  }
}

/** 실제 기능 중인지 (원본 창고/작업장 효과의 근거 — G5에서 사용) */
export function isFunctional(s: BuildingStatus): boolean {
  return s === 'active';
}
