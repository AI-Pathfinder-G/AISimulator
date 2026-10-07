// 렌더 데이터 최소 계약 (설계문서 4.4). 그래픽 좌표는 x,y,z(지면 XZ, 위쪽 Y).
export type SceneMode = 'showcase' | 'simulation' | 'replay';
export type Era = 'agrarian' | 'stone' | 'modern';
export type WeatherKind = 'clear' | 'rain' | 'snow' | 'storm';
export type TimeOfDay = 'day' | 'sunset' | 'night';

export type BuildingStatus = 'planned' | 'constructing' | 'active' | 'damaged' | 'ruined' | 'repairing';
export type BuildingKind = 'house' | 'hall' | 'workshop' | 'storage' | 'farm' | 'tower';

export interface Vec2 { x: number; z: number }

export interface TerrainView {
  width: number; // 96
  depth: number; // 64
  seed: number;
}

export interface SettlementView {
  id: string;
  name: string;
  factionId: string;
  factionName: string;
  emblem: 'sun' | 'leaf';
  center: Vec2;
  plazaRadius: number;
  population: number;
  era: Era;
}

export interface BuildingView {
  id: string;
  settlementId: string;
  name: string;
  kind: BuildingKind;
  /** 중심 좌표 */
  position: Vec2;
  /** 0,1,2,3 → 0°,90°,180°,270° */
  rotationQuarter: 0 | 1 | 2 | 3;
  /** 발자국 (회전 전 폭 x, 깊이 z) */
  width: number;
  depth: number;
  status: BuildingStatus;
  hp: number;
  maxHp: number;
  progress: number; // 공사/복구 진척 0~1
  variant: number;
}

export interface ResidentView {
  id: string;
  name: string;
  job: string;
  settlementId: string;
  homeId: string;
  workId: string;
  model: string; // asset-manifest character id
  alive: boolean;
}

export interface UnitView {
  id: string;
  squadId: string;
  name: string;
  model: string;
}

export interface SquadView {
  id: string;
  name: string;
  factionId: string;
  settlementId: string;
  unitIds: string[];
  strength: number; // 0~100 (시험 표시용)
}

export interface WeatherView {
  kind: WeatherKind;
  timeOfDay: TimeOfDay;
}

interface VisualEventBase {
  id: string;
  mode: SceneMode;
  /** 실제 세계에서는 필수, 시험은 null 허용 */
  sourceEventId: string | null;
  worldVersion: number;
  day: number;
  actorIds: string[];
  targetIds: string[];
  visualSeed: number;
}

export type VisualEvent =
  | (VisualEventBase & { kind: 'missile'; payload: { from: Vec2; to: Vec2; targetBuildingId: string } })
  | (VisualEventBase & { kind: 'impact'; payload: { at: Vec2; targetBuildingId: string; before: BuildingStatus; after: BuildingStatus } })
  | (VisualEventBase & { kind: 'attack'; payload: { attackerSquadId: string; defenderSquadId: string } })
  | (VisualEventBase & { kind: 'repair'; payload: { targetBuildingId: string } })
  | (VisualEventBase & { kind: 'move'; payload: { to: Vec2 } })
  | (VisualEventBase & { kind: 'construction'; payload: { targetBuildingId: string } });

export interface RenderBundle {
  mode: SceneMode;
  worldId: string;
  worldVersion: number;
  day: number;
  layoutVersion: number;
  terrain: TerrainView;
  settlements: SettlementView[];
  buildings: BuildingView[];
  residents: ResidentView[];
  units: UnitView[];
  squads: SquadView[];
  weather: WeatherView;
  visualEvents: VisualEvent[];
}
