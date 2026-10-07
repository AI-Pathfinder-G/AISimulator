// /showcase — 연출 검증 화면. 지도가 주역, 한국어 상단 정보줄과 선택 패널 (설계문서 1.2, 4.1)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { WorldCanvas } from '../world3d/WorldCanvas';
import { statusKo, type LogEntry, type SceneStats, type Selection, type ShowcaseController } from '../world3d/createScene';
import { SHOWCASE_BANNER } from '../world3d/sources/showcaseSource';
import type { Era, TimeOfDay, WeatherKind } from '../shared/render-contracts';
import type { QualityLevel } from '../world3d/quality/quality';

const WEATHER: Array<[WeatherKind, string]> = [['clear', '맑음'], ['rain', '비'], ['snow', '눈'], ['storm', '폭풍']];
const TIMES: Array<[TimeOfDay, string]> = [['day', '낮'], ['sunset', '석양'], ['night', '밤']];
const ERAS: Array<[Era, string]> = [['agrarian', '농경 마을'], ['stone', '석조 도시'], ['modern', '현대 도시']];
const KIND_KO: Record<string, string> = { house: '주택', hall: '마을회관', workshop: '작업장', storage: '공동 창고', farm: '농장', tower: '망루' };
const STATE_KO: Record<string, string> = { idle: '쉬는 중', walking: '걷는 중', working: '일하는 중' };
const DEST_KO: Record<string, string> = { home: '집', work: '일터', plaza: '광장' };
const PHASE_KO: Record<string, string> = { idle: '대기', approach: '접근 중', engage: '교전 중', retreat: '후퇴 중', done: '종료' };

export function ShowcaseScreen() {
  const [ctrl, setCtrl] = useState<ShowcaseController | null>(null);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState<[number, number]>([0, 1]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [weather, setWeather] = useState<WeatherKind>('clear');
  const [time, setTime] = useState<TimeOfDay>('day');
  const [era, setEra] = useState<Era>('agrarian');
  const [quality, setQuality] = useState<QualityLevel>('medium');
  const [paused, setPaused] = useState(false);
  const [fx, setFx] = useState({ shake: true, flash: true, frozenEffects: false });
  const [stats, setStats] = useState<SceneStats | null>(null);
  const [tick, setTick] = useState(0);

  const callbacks = useMemo(() => ({
    onReady: () => setReady(true),
    onProgress: (d: number, t: number) => setProgress([d, t]),
    onSelect: (s: Selection | null) => { setSelection(s); if (import.meta.env.DEV && window.__SCENE_TEST__) window.__SCENE_TEST__.selected = s; },
    onLog: (e: LogEntry) => setLogs((l) => [e, ...l].slice(0, 30)),
    onError: (m: string) => setError(m),
  }), []);
  const onController = useCallback((c: ShowcaseController | null) => setCtrl(c), []);
  const onFatal = useCallback((m: string) => setFatal(m), []);

  // 매 프레임 React state 를 갱신하지 않는다: UI 통계는 낮은 빈도로 (설계문서 10.3)
  useEffect(() => {
    if (!ctrl) return;
    const id = setInterval(() => { setStats(ctrl.stats()); setTick((t) => t + 1); }, 500);
    return () => clearInterval(id);
  }, [ctrl]);

  const bundle = useMemo(() => ctrl?.source.bundle() ?? null, [ctrl, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (s: Selection) => { ctrl?.select(s); ctrl?.focus(s); };

  const detail = (() => {
    if (!selection || !bundle) return null;
    if (selection.type === 'resident') {
      const r = bundle.residents.find((x) => x.id === selection.id); if (!r) return null;
      const d = ctrl?.describeResident(r.id);
      const s = bundle.settlements.find((x) => x.id === r.settlementId);
      const home = bundle.buildings.find((b) => b.id === r.homeId), work = bundle.buildings.find((b) => b.id === r.workId);
      return { title: r.name, rows: [['ID', r.id], ['직업', r.job], ['마을', s?.name ?? '-'], ['상태', d ? STATE_KO[d.state] : '-'], ['목적지', d?.destination ? DEST_KO[d.destination] : '-'], ['재생 클립', d?.clip ?? '-'], ['집', home?.name ?? '-'], ['일터', work?.name ?? '-']] };
    }
    if (selection.type === 'unit') {
      const u = bundle.units.find((x) => x.id === selection.id); if (!u) return null;
      const sq = bundle.squads.find((s) => s.id === u.squadId);
      return { title: u.name, rows: [['ID', u.id], ['분대', sq?.name ?? '-'], ['분대 전력(시험)', String(stats?.strengths[u.squadId] ?? sq?.strength ?? '-')], ['구분', '시험 인물 · 주민 24명과 별개']] };
    }
    if (selection.type === 'building') {
      const b = bundle.buildings.find((x) => x.id === selection.id); if (!b) return null;
      return { title: b.name, rows: [['ID', b.id], ['종류', KIND_KO[b.kind]], ['상태', statusKo(b.status)], ['내구도', `${b.hp}/${b.maxHp}`], ['진척', `${Math.round(b.progress * 100)}%`]], building: b };
    }
    const s = bundle.settlements.find((x) => x.id === selection.id); if (!s) return null;
    const bs = bundle.buildings.filter((b) => b.settlementId === s.id);
    return { title: s.name, rows: [['ID', s.id], ['세력', s.factionName], ['문양', s.emblem === 'sun' ? '해 (원형)' : '잎 (마름모)'], ['주민 수', `${bundle.residents.filter((r) => r.settlementId === s.id).length}명`], ['건물', `${bs.length}개 (공사 중 ${bs.filter((b) => b.status === 'constructing').length}, 손상 ${bs.filter((b) => b.status === 'damaged').length}, 폐허 ${bs.filter((b) => b.status === 'ruined').length})`], ['자원', '시험 fixture — 경제 엔진 미연결 (G4)']] };
  })();

  if (fatal) return <div className="fatal" role="alert"><h1>3D 화면을 열 수 없습니다</h1><p>{fatal}</p><p>WebGL2 를 지원하는 브라우저/GPU 설정이 필요합니다.</p></div>;

  return (
    <div className="showcase">
      <WorldCanvas callbacks={callbacks} onController={onController} onFatal={onFatal} />

      <header className="topbar" onWheel={(e) => e.stopPropagation()}>
        <strong>작은 문명 관찰소</strong>
        <span className="mode-banner" data-testid="mode-banner">{SHOWCASE_BANNER}</span>
        <span>날씨 {WEATHER.find((w) => w[0] === weather)![1]} · {TIMES.find((t) => t[0] === time)![1]} · {ERAS.find((e) => e[0] === era)![1]} 외형 미리보기</span>
        {stats?.replaying && <span className="replay-tag">기록 연출 중</span>}
        {paused && <span className="replay-tag">연출 일시정지</span>}
        <span className="stats">{stats ? `${stats.fps.toFixed(0)} fps · 메시 ${stats.meshes} · 입자 ${stats.activeParticles} · WebGL${stats.webgl}` : ''}</span>
      </header>

      {!ready && !fatal && <div className="loading" data-testid="loading">에셋 불러오는 중… {progress[0]}/{progress[1]}</div>}
      {error && <div className="error-toast" role="alert" onClick={() => setError(null)}>{error}</div>}

      <aside className="panel left" onWheel={(e) => e.stopPropagation()} data-testid="entity-list">
        <h2>마을</h2>
        {bundle?.settlements.map((s) => <button key={s.id} className={selection?.id === s.id ? 'sel' : ''} onClick={() => pick({ type: 'settlement', id: s.id })}>{s.name} <small>{s.factionName}</small></button>)}
        <h2>주민 ({bundle?.residents.length ?? 0})</h2>
        <div className="list">
          {bundle?.residents.map((r) => <button key={r.id} data-resident={r.id} className={selection?.id === r.id ? 'sel' : ''} onClick={() => pick({ type: 'resident', id: r.id })}>{r.name} <small>{r.job} · {bundle.settlements.find((s) => s.id === r.settlementId)?.name}</small></button>)}
        </div>
        <h2>시험 분대</h2>
        {bundle?.squads.map((sq) => <div key={sq.id} className="squad"><b>{sq.name}</b> <small>전력 {stats?.strengths[sq.id] ?? sq.strength}</small>
          <div className="chips">{sq.unitIds.map((u) => <button key={u} onClick={() => pick({ type: 'unit', id: u })}>{u.split('-').pop()}</button>)}</div></div>)}
      </aside>

      {detail && (
        <aside className="panel right" onWheel={(e) => e.stopPropagation()} data-testid="detail-panel">
          <div className="panel-head"><h2 data-testid="detail-title">{detail.title}</h2><button aria-label="선택 해제" data-testid="close-detail" onClick={() => ctrl?.select(null)}>✕</button></div>
          <table><tbody>{detail.rows.map(([k, v]) => <tr key={k}><th>{k}</th><td data-field={k}>{v}</td></tr>)}</tbody></table>
          {'building' in detail && detail.building && detail.building.kind !== 'farm' && (
            <div className="row">
              <button onClick={() => ctrl?.fireMissile(detail.building!.id)}>이 건물에 시험 미사일</button>
              <button disabled={!['damaged', 'ruined'].includes(detail.building.status)} onClick={() => ctrl?.repair(detail.building!.id)}>시험 복구</button>
            </div>
          )}
          <button className="link" onClick={() => selection && ctrl?.focus(selection)}>이 대상으로 카메라 이동</button>
        </aside>
      )}

      <footer className="dock" onWheel={(e) => e.stopPropagation()}>
        <div className="group"><span>날씨</span>{WEATHER.map(([k, l]) => <button key={k} data-testid={`weather-${k}`} className={weather === k ? 'on' : ''} onClick={() => { setWeather(k); ctrl?.setWeather(k); }}>{l}</button>)}</div>
        <div className="group"><span>시간</span>{TIMES.map(([k, l]) => <button key={k} data-testid={`time-${k}`} className={time === k ? 'on' : ''} onClick={() => { setTime(k); ctrl?.setTimeOfDay(k); }}>{l}</button>)}</div>
        <div className="group"><span>시대 외형 미리보기</span>{ERAS.map(([k, l]) => <button key={k} data-testid={`era-${k}`} className={era === k ? 'on' : ''} onClick={() => { setEra(k); ctrl?.setEra(k); }}>{l}</button>)}</div>
        <div className="group test"><span>시험 연출</span>
          <button data-testid="start-battle" onClick={() => ctrl?.startBattle()}>시험 전투 시작</button>
          <button data-testid="fire-missile" onClick={() => ctrl?.fireMissile()}>시험 미사일</button>
          <button data-testid="replay-missile" onClick={() => ctrl?.replayLastMissile()}>마지막 미사일 다시 보기</button>
          <button data-testid="reset-test" onClick={() => ctrl?.resetTest()}>시험 초기화</button>
          <span className="phase">전투: {PHASE_KO[stats?.battlePhase ?? 'idle']}</span>
        </div>
        <div className="group"><span>효과</span>
          <label><input type="checkbox" checked={fx.shake} onChange={(e) => { const v = { ...fx, shake: e.target.checked }; setFx(v); ctrl?.setEffectOptions(v); }} />흔들림</label>
          <label><input type="checkbox" checked={fx.flash} onChange={(e) => { const v = { ...fx, flash: e.target.checked }; setFx(v); ctrl?.setEffectOptions(v); }} />섬광</label>
          <label><input type="checkbox" checked={fx.frozenEffects} onChange={(e) => { const v = { ...fx, frozenEffects: e.target.checked }; setFx(v); ctrl?.setEffectOptions(v); }} />효과 정지</label>
          <button data-testid="pause" className={paused ? 'on' : ''} onClick={() => { setPaused(!paused); ctrl?.setPaused(!paused); }}>{paused ? '연출 재개' : '연출 일시정지'}</button>
          <select value={quality} onChange={(e) => { const q = e.target.value as QualityLevel; setQuality(q); ctrl?.setQuality(q); }} aria-label="품질"><option value="low">품질 Low</option><option value="medium">품질 Medium</option></select>
        </div>
        <div className="group"><span>카메라</span>
          <button data-testid="overview" onClick={() => ctrl?.focus('overview')}>전체 보기</button>
          <button onClick={() => ctrl?.zoom(1)} aria-label="확대">＋</button><button onClick={() => ctrl?.zoom(-1)} aria-label="축소">－</button>
          <button onClick={() => ctrl?.rotate(-1)} aria-label="왼쪽 회전">⟲</button><button onClick={() => ctrl?.rotate(1)} aria-label="오른쪽 회전">⟳</button>
        </div>
      </footer>

      <section className="log" onWheel={(e) => e.stopPropagation()} data-testid="event-log">
        {logs.slice(0, 6).map((l) => <div key={l.id}>{l.text}</div>)}
      </section>
    </div>
  );
}
