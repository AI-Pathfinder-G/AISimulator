// ShowcaseSource: 고정 seed 메모리 fixture. 세계 DB·명령 API·LLM 과 연결되지 않는다 (설계문서 4.1, G3 상태 전이는 fixture 전용).
import type { BuildingStatus, Era, RenderBundle, TimeOfDay, VisualEvent, WeatherKind } from '../../shared/render-contracts';
import { createShowcaseFixture, SHOWCASE_WORLD_ID, type ShowcaseFixture } from '../../fixtures/showcase/baseScene';
import { statusAfterHit, canTransition } from '../presentation/buildingState';

export const SHOWCASE_BANNER = '연출 검증 모드 · 실제 세계 저장 없음';
export const REPAIR_SECONDS = 8;

export interface ImpactResult { applied: boolean; before: BuildingStatus; after: BuildingStatus }

export class ShowcaseSource {
  private fixture: ShowcaseFixture;
  private appliedImpacts = new Set<string>();
  version = 1;
  era: Era = 'agrarian';
  weather: WeatherKind = 'clear';
  timeOfDay: TimeOfDay = 'day';
  private listeners = new Set<() => void>();

  constructor() {
    this.fixture = createShowcaseFixture(this.era);
  }

  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private emit() { this.version++; for (const l of this.listeners) l(); }

  get worldId() { return SHOWCASE_WORLD_ID; }

  building(id: string) { return this.fixture.buildings.find((b) => b.id === id); }

  setEra(e: Era) { this.era = e; this.fixture.settlements.forEach((s) => (s.era = e)); this.emit(); }
  setWeather(w: WeatherKind) { this.weather = w; this.emit(); }
  setTimeOfDay(t: TimeOfDay) { this.timeOfDay = t; this.emit(); }

  /** 시험 미사일 명중: 같은 이벤트는 한 번만 적용 (재생/중복 연출로 재적용 없음, V05) */
  applyImpact(eventId: string, buildingId: string): ImpactResult {
    const b = this.building(buildingId);
    if (!b) throw new Error(`unknown building ${buildingId}`);
    if (this.appliedImpacts.has(eventId)) return { applied: false, before: b.status, after: b.status };
    this.appliedImpacts.add(eventId);
    const before = b.status;
    const after = statusAfterHit(before);
    if (after !== before) {
      b.status = after;
      b.hp = after === 'ruined' ? 0 : Math.min(b.hp, 45);
      b.progress = after === 'ruined' ? 0 : b.progress;
      this.emit();
    }
    return { applied: true, before, after };
  }

  /** 시험 복구 시작: 손상/폐허 → 복구 중 (자동 재건 없음, 명시적 버튼만) */
  startRepair(buildingId: string): boolean {
    const b = this.building(buildingId);
    if (!b || !canTransition(b.status, 'repairing')) return false;
    b.status = 'repairing';
    b.progress = 0;
    this.emit();
    return true;
  }

  /** 복구 진행 (presentationTime). 완료되면 active */
  tick(dt: number): void {
    let changed = false;
    for (const b of this.fixture.buildings) {
      if (b.status !== 'repairing') continue;
      b.progress = Math.min(1, b.progress + dt / REPAIR_SECONDS);
      if (b.progress >= 1) { b.status = 'active'; b.hp = b.maxHp; changed = true; }
    }
    if (changed) this.emit();
  }

  /** 초기 상태 리셋: 시험 데이터만 복구 (날씨·시대 같은 보기 설정은 유지) */
  reset(): void {
    this.fixture = createShowcaseFixture(this.era);
    this.appliedImpacts.clear();
    this.emit();
  }

  /** 읽기 전용 RenderBundle. 깊은 복사이므로 원본 상태를 바꾸지 않음 (V04) */
  bundle(visualEvents: VisualEvent[] = []): RenderBundle {
    const f = structuredClone(this.fixture);
    return {
      mode: 'showcase', worldId: SHOWCASE_WORLD_ID, worldVersion: this.version, day: 0, layoutVersion: 1,
      terrain: { width: 96, depth: 64, seed: f.seed },
      settlements: f.settlements, buildings: f.buildings, residents: f.residents, units: f.units, squads: f.squads,
      weather: { kind: this.weather, timeOfDay: this.timeOfDay }, visualEvents: structuredClone(visualEvents),
    };
  }
}
