// V04 버전/불변, V05 중복 연출 방지·재생 시 피해 재적용 없음, V06 showcase 격리, V07 로드 취소, V08 건물 상태
import { describe, expect, it, vi } from 'vitest';
import { VisualEventQueue } from '../../src/world3d/presentation/eventQueue';
import { ShowcaseSource, SHOWCASE_BANNER } from '../../src/world3d/sources/showcaseSource';
import { shouldAccept } from '../../src/world3d/sources/versionGate';
import { createCommandClient, ShowcaseIsolationError } from '../../src/world3d/sources/commandClient';
import { LoadToken } from '../../src/world3d/assets/loadToken';
import { canTransition, statusAfterHit, isFunctional } from '../../src/world3d/presentation/buildingState';
import type { VisualEvent } from '../../src/shared/render-contracts';

const ev = (id: string, mode: VisualEvent['mode'] = 'showcase'): VisualEvent => ({
  id, mode, sourceEventId: null, worldVersion: 1, day: 0, kind: 'repair', actorIds: [], targetIds: [], visualSeed: 1, payload: { targetBuildingId: 'b' },
});

describe('V05 연출 큐', () => {
  it('같은 이벤트는 한 번만 연출', () => {
    const q = new VisualEventQueue('showcase', 'w1');
    expect(q.enqueue(ev('a'))).toBe(true);
    expect(q.enqueue(ev('a'))).toBe(false);
    expect(q.drain()).toHaveLength(1);
    expect(q.enqueue(ev('a'))).toBe(false); // drain 이후에도 중복
  });
  it('다른 모드 이벤트는 거부, 세계 전환 시 큐/기록 초기화', () => {
    const q = new VisualEventQueue('showcase', 'w1');
    expect(q.enqueue(ev('x', 'simulation'))).toBe(false);
    q.enqueue(ev('a'));
    q.switchWorld('showcase', 'w2');
    expect(q.pendingSize).toBe(0);
    expect(q.enqueue(ev('a'))).toBe(true);
  });
  it('중복 기록은 범위 제한 (무한 증가 없음), 넘친 연출은 생략 수로 남김', () => {
    const q = new VisualEventQueue('showcase', 'w1', 50, 4);
    for (let i = 0; i < 500; i++) q.enqueue(ev(`e${i}`));
    expect(q.historySize).toBe(50);
    expect(q.pendingSize).toBe(4);
    expect(q.skipped).toBe(496);
  });
});

describe('ShowcaseSource (fixture 전용 상태 전이)', () => {
  it('배너 문구', () => expect(SHOWCASE_BANNER).toBe('연출 검증 모드 · 실제 세계 저장 없음'));
  it('명중 → 손상 → 폐허, 같은 이벤트 재생으로 피해 재적용 없음', () => {
    const s = new ShowcaseSource();
    const id = 'b-west-1';
    expect(s.applyImpact('m1', id)).toMatchObject({ applied: true, before: 'active', after: 'damaged' });
    expect(s.applyImpact('m1', id)).toMatchObject({ applied: false });
    expect(s.building(id)!.status).toBe('damaged');
    s.applyImpact('m2', id);
    expect(s.building(id)!.status).toBe('ruined');
  });
  it('폐허는 시간이 지나도 유지되고, 명시적 복구로만 active', () => {
    const s = new ShowcaseSource();
    s.applyImpact('m1', 'b-west-1'); s.applyImpact('m2', 'b-west-1');
    for (let i = 0; i < 1000; i++) s.tick(0.1);
    expect(s.building('b-west-1')!.status).toBe('ruined');
    expect(s.startRepair('b-west-1')).toBe(true);
    s.tick(4);
    expect(s.building('b-west-1')!.status).toBe('repairing');
    for (let i = 0; i < 60; i++) s.tick(0.1);
    expect(s.building('b-west-1')!.status).toBe('active');
    expect(s.startRepair('b-west-1')).toBe(false);
  });
  it('리셋은 시험 데이터만 복구 (보기 설정은 유지)', () => {
    const s = new ShowcaseSource();
    s.setEra('modern'); s.setWeather('snow');
    s.applyImpact('m1', 'b-east-0');
    s.reset();
    expect(s.building('b-east-0')!.status).toBe('active');
    expect(s.era).toBe('modern');
    expect(s.weather).toBe('snow');
    expect(s.applyImpact('m1', 'b-east-0').applied).toBe(true); // 리셋 후 새 시험
  });
  it('V04 bundle 은 원본 상태를 바꾸지 않는다', () => {
    const s = new ShowcaseSource();
    const b = s.bundle();
    b.buildings[0].status = 'ruined';
    b.residents.pop();
    expect(s.building(b.buildings[0].id)!.status).not.toBe('ruined');
    expect(s.bundle().residents).toHaveLength(24);
    expect(b.mode).toBe('showcase');
  });
});

describe('V04 버전 게이트', () => {
  it('낮은 버전 응답 무시, 세계 전환은 수용', () => {
    const cur = { worldId: 'w', mode: 'simulation' as const, worldVersion: 5 };
    expect(shouldAccept(cur, { ...cur, worldVersion: 4 })).toBe(false);
    expect(shouldAccept(cur, { ...cur, worldVersion: 5 })).toBe(false);
    expect(shouldAccept(cur, { ...cur, worldVersion: 6 })).toBe(true);
    expect(shouldAccept(cur, { worldId: 'w2', mode: 'simulation', worldVersion: 1 })).toBe(true);
    expect(shouldAccept(null, cur)).toBe(true);
  });
});

describe('V06 showcase 격리', () => {
  it('showcase/replay 클라이언트는 fetch 를 호출하지 않고 거부한다', async () => {
    for (const mode of ['showcase', 'replay'] as const) {
      const f = vi.fn();
      const c = createCommandClient(mode, f);
      await expect(c.advanceDays(1)).rejects.toBeInstanceOf(ShowcaseIsolationError);
      await expect(c.sendIntervention('RAIN', {})).rejects.toBeInstanceOf(ShowcaseIsolationError);
      await expect(c.askAi('hi')).rejects.toBeInstanceOf(ShowcaseIsolationError);
      expect(f).not.toHaveBeenCalled();
    }
  });
  it('simulation 에서도 AI 호출은 비활성 (G0~G5 LLM 0회)', async () => {
    const f = vi.fn();
    await expect(createCommandClient('simulation', f).askAi('x')).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });
});

describe('V07 비동기 로드 취소', () => {
  it('취소된 토큰은 결과를 폐기·dispose 한다', async () => {
    const t = new LoadToken();
    const dispose = vi.fn();
    let resolve!: (v: string) => void;
    const p = t.guard(new Promise<string>((r) => (resolve = r)), dispose);
    t.cancel();
    resolve('mesh');
    expect(await p).toBeNull();
    expect(dispose).toHaveBeenCalledWith('mesh');
    expect(await new LoadToken().guard(Promise.resolve(3))).toBe(3);
  });
});

describe('V08 건물 상태 전이', () => {
  it('허용 전이만 가능', () => {
    expect(canTransition('active', 'damaged')).toBe(true);
    expect(canTransition('ruined', 'active')).toBe(false); // 복구 없이 원상복귀 금지
    expect(canTransition('ruined', 'repairing')).toBe(true);
    expect(canTransition('repairing', 'active')).toBe(true);
    expect(canTransition('planned', 'active')).toBe(false);
  });
  it('명중 시 단계적 악화, 기능은 active 에서만', () => {
    expect(statusAfterHit('active')).toBe('damaged');
    expect(statusAfterHit('damaged')).toBe('ruined');
    expect(statusAfterHit('ruined')).toBe('ruined');
    expect(isFunctional('damaged')).toBe(false);
    expect(isFunctional('active')).toBe(true);
  });
});
