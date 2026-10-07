// 실제 브라우저 검수 (설계문서 13.2): 모델 로드, 검은 캔버스 아님, 보행, 클릭 선택 ID, 날씨/시대, 미사일·전투, 자원 누수.
import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const VIS = 'artifacts/visual';
mkdirSync(VIS, { recursive: true });

type Stats = { meshes: number; particleSystems: number; lights: number; materials: number; textures: number; activeParticles: number; battlePhase: string; explosionSlots: number; missileSlots: number; missilesInFlight: number; cameraTarget: { x: number; z: number }; buildingStatuses: Record<string, string>; webgl: number; strengths: Record<string, number> };

async function open(page: Page, external: string[] = []) {
  page.on('request', (r) => { const u = new URL(r.url()); if (u.host !== '127.0.0.1:5173' && !u.protocol.startsWith('data') && !u.protocol.startsWith('blob')) external.push(r.url()); if (u.pathname.startsWith('/api')) external.push(r.url()); });
  await page.goto('/showcase');
  await page.waitForFunction(() => window.__SCENE_TEST__?.ready === true, null, { timeout: 180_000 });
  await page.waitForTimeout(1500); // 최소 한 번 이상의 렌더 이후 캡처
}
const stats = (p: Page) => p.evaluate(() => window.__SCENE_TEST__!.stats()) as Promise<Stats>;
const ctrl = (p: Page, js: string) => p.evaluate(`(()=>{const c=window.__SCENE_TEST__.controller;return ${js}})()`);

/** 캔버스 픽셀 통계: 검은/단색 화면이 아닌지 */
async function canvasStats(p: Page) {
  return p.evaluate(() => {
    const src = document.querySelector('canvas.world-canvas') as HTMLCanvasElement;
    const c = document.createElement('canvas'); c.width = 160; c.height = 90;
    const ctx = c.getContext('2d')!; ctx.drawImage(src, 0, 0, 160, 90);
    const d = ctx.getImageData(0, 0, 160, 90).data;
    let sum = 0, sq = 0; const colors = new Set<number>();
    for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; sum += l; sq += l * l; colors.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4)); }
    const n = d.length / 4, mean = sum / n;
    return { mean, std: Math.sqrt(sq / n - mean * mean), colors: colors.size };
  });
}

test.describe('G1 작지만 살아 있는 섬', () => {
  test('로드·표시·보행·선택 @capture', async ({ page }) => {
    const external: string[] = [];
    await open(page, external);
    await expect(page.getByTestId('mode-banner')).toHaveText('연출 검증 모드 · 실제 세계 저장 없음');
    const s = await stats(page);
    expect(s.webgl).toBe(2);
    expect(await page.evaluate(() => window.__SCENE_TEST__!.engineCount())).toBe(1); // StrictMode 재마운트 후에도 Engine 1개
    expect(await page.evaluate(() => window.__SCENE_TEST__!.residentIds().length)).toBe(24);
    const cs = await canvasStats(page);
    expect(cs.std).toBeGreaterThan(15);
    expect(cs.colors).toBeGreaterThan(40);
    await page.screenshot({ path: `${VIS}/G1-overview.png` });

    // 보행: 2초 사이에 실제로 위치가 바뀐 인물, 동시에 다른 클립
    const pos = () => page.evaluate(() => window.__SCENE_TEST__!.residentIds().map((id) => window.__SCENE_TEST__!.project({ type: 'resident', id })));
    const clips = () => page.evaluate(() => window.__SCENE_TEST__!.residentIds().map((id) => window.__SCENE_TEST__!.resident(id)!.clip));
    const p0 = await pos();
    await page.waitForTimeout(2500);
    const p1 = await pos();
    const moved = p0.filter((a, i) => a && p1[i] && Math.hypot(a.x - p1[i]!.x, a.y - p1[i]!.y) > 2).length;
    expect(moved).toBeGreaterThanOrEqual(3);
    const seen = new Set<string>();
    for (let k = 0; k < 6; k++) { (await clips()).forEach((c) => c && seen.add(c)); await page.waitForTimeout(800); }
    expect(seen.has('walk')).toBe(true);
    expect(seen.has('idle') || seen.has('interact-right')).toBe(true);

    // 마을 근접
    await page.getByRole('button', { name: /하늘마을/ }).first().click();
    await page.waitForTimeout(2500);
    await expect(page.getByTestId('detail-title')).toHaveText('하늘마을');
    await page.screenshot({ path: `${VIS}/G1-town-closeup.png` });

    // 주민 근접 + 목록 선택 ID
    await page.locator('[data-resident="r-03"]').click();
    await page.waitForTimeout(2500);
    await expect(page.locator('td[data-field="ID"]')).toHaveText('r-03');
    await page.screenshot({ path: `${VIS}/G1-resident-closeup.png` });

    // 캔버스 클릭 선택: 일시정지 후 화면 좌표의 인물을 클릭 → 같은 ID
    await page.getByTestId('pause').click();
    await page.getByTestId('close-detail').click();
    await expect(page.getByTestId('detail-panel')).toHaveCount(0);
    let clickedOk = false;
    for (const id of ['r-03', 'r-01', 'r-05', 'r-02', 'r-04', 'r-06']) {
      await ctrl(page, `c.focus({type:'resident',id:'${id}'})`);
      await page.waitForTimeout(1800);
      const pt = await page.evaluate((rid) => window.__SCENE_TEST__!.project({ type: 'resident', id: rid }), id);
      if (!pt) continue;
      await page.mouse.click(pt.x, pt.y);
      await page.waitForTimeout(400);
      const sel = await page.evaluate(() => window.__SCENE_TEST__!.selected);
      if (sel?.type === 'resident') { expect(sel.id).toBe(id); await expect(page.locator('td[data-field="ID"]')).toHaveText(id); clickedOk = true; break; }
    }
    expect(clickedOk).toBe(true);

    // 드래그는 선택이 아니라 이동
    await page.getByTestId('close-detail').click();
    const before = (await stats(page)).cameraTarget;
    await page.mouse.move(900, 500); await page.mouse.down(); await page.mouse.move(1100, 600, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__SCENE_TEST__!.selected)).toBeNull();
    const after = (await stats(page)).cameraTarget;
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(1);
    // 캔버스 밖(패널 위)에서 놓아도 stuck 없음: 이후 버튼 없이 움직여도 카메라 고정
    await page.mouse.move(900, 500); await page.mouse.down(); await page.mouse.move(60, 300, { steps: 6 });
    await page.dispatchEvent('body', 'pointerup');
    await page.mouse.up();
    const t1 = (await stats(page)).cameraTarget;
    await page.mouse.move(1200, 700, { steps: 6 });
    const t2 = (await stats(page)).cameraTarget;
    expect(Math.hypot(t2.x - t1.x, t2.z - t1.z)).toBeLessThan(0.01);
    await page.getByTestId('pause').click();

    // showcase 는 외부/API/LLM 요청 없음
    expect(external).toEqual([]);
  });
});

test.describe('G2 날씨·하루·도시 외형', () => {
  test('비/밤, 눈, 현대 도시, 효과 리셋 누수 없음 @capture', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: /하늘마을/ }).first().click();
    await page.waitForTimeout(1500);
    await page.getByTestId('weather-rain').click();
    await page.getByTestId('time-night').click();
    await page.waitForTimeout(3500);
    expect((await stats(page)).activeParticles).toBeGreaterThan(200);
    const night = await canvasStats(page);
    expect(night.std).toBeGreaterThan(8); // 어두워도 길과 인물이 보임
    await expect(page.getByTestId('detail-panel')).toBeVisible(); // 날씨 중에도 UI 유지
    await page.screenshot({ path: `${VIS}/G2-rain-night.png` });

    await page.getByTestId('time-day').click();
    await page.getByTestId('weather-snow').click();
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${VIS}/G2-snow.png` });

    await page.getByTestId('weather-storm').click();
    await page.getByTestId('time-sunset').click();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${VIS}/G2-storm-sunset.png` });

    await page.getByTestId('weather-clear').click();
    await page.getByTestId('time-day').click();
    // 시대 외형: 실제로 다른 장면 (픽셀 차이)
    const shotAgr = await page.screenshot();
    await page.getByTestId('era-stone').click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${VIS}/G2-stone-town.png` });
    await page.getByTestId('era-modern').click();
    await page.waitForTimeout(3000);
    const shotMod = await page.screenshot({ path: `${VIS}/G2-modern-town.png` });
    expect(Buffer.compare(shotAgr, shotMod)).not.toBe(0);
    await page.getByTestId('time-night').click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${VIS}/G2-modern-night.png` });

    // effects reset 누수: 날씨/시대 전환 반복 후 입자시스템·메시·재질 수가 늘지 않음
    await page.getByTestId('era-agrarian').click();
    await page.getByTestId('weather-clear').click();
    await page.waitForTimeout(1500);
    const base = await stats(page);
    for (let i = 0; i < 6; i++) {
      for (const w of ['rain', 'snow', 'storm', 'clear']) await page.getByTestId(`weather-${w}`).click();
      for (const e of ['stone', 'modern', 'agrarian']) await page.getByTestId(`era-${e}`).click();
    }
    await page.waitForTimeout(1500);
    const end = await stats(page);
    expect(end.particleSystems).toBe(base.particleSystems);
    expect(end.meshes).toBe(base.meshes);
    expect(end.lights).toBe(base.lights);
    expect(end.materials).toBeLessThanOrEqual(base.materials + 30); // 시대별 재질 변형 캐시는 상한이 있음
    const end2 = await stats(page);
    for (let i = 0; i < 3; i++) { for (const e of ['stone', 'modern', 'agrarian']) await page.getByTestId(`era-${e}`).click(); }
    await page.waitForTimeout(800);
    expect((await stats(page)).materials).toBe(end2.materials);
  });
});

test.describe('G3 전투·미사일·폭발', () => {
  test('미사일 비행→명중→폐허 유지, 리셋은 시험 데이터만 @capture', async ({ page }) => {
    test.setTimeout(540_000);
    await open(page);
    await page.getByRole('button', { name: /하늘마을/ }).first().click();
    await page.waitForTimeout(2000);
    await ctrl(page, `c.focus({type:'building',id:'b-west-1'})`);
    await page.waitForTimeout(1000);
    await ctrl(page, `c.zoom(-1)`);
    await page.waitForTimeout(800);
    expect(await ctrl(page, `c.fireMissile('b-west-1')`)).toBe('test-missile-1');
    // 시간 지점을 고정한 연속 캡처: 연출 진행률 기준으로 일시정지 후 촬영 (헤드리스 프레임 속도와 무관)
    const progress = async () => ((await stats(page)) as unknown as { missileProgress: number[] }).missileProgress[0] ?? 99;
    const points = [0.35, 0.6, 0.8, 0.95, 1.08, 1.4, 2.2, 3.0];
    for (const [k, pt] of points.entries()) {
      await expect.poll(progress, { timeout: 60_000, intervals: [100] }).toBeGreaterThanOrEqual(pt);
      await page.getByTestId('pause').click();
      await page.screenshot({ path: `${VIS}/G3-seq-${String(k).padStart(2, '0')}-t${pt}.png` });
      if (pt === 0.8) await page.screenshot({ path: `${VIS}/G3-flight.png` });
      if (pt === 1.08) await page.screenshot({ path: `${VIS}/G3-impact.png` });
      await page.getByTestId('pause').click();
    }
    expect((await stats(page)).buildingStatuses['b-west-1']).toBe('damaged');
    // 두 번째 명중 → 폐허
    await ctrl(page, `c.fireMissile('b-west-1')`);
    await expect.poll(async () => (await stats(page)).buildingStatuses['b-west-1'], { timeout: 30_000 }).toBe('ruined');
    // 효과 수명(불/연기)이 끝나도 폐허 유지, 자동 재건 없음
    await expect.poll(async () => ((await stats(page)) as unknown as { explosionsBusy: number }).explosionsBusy, { timeout: 120_000, intervals: [1000] }).toBe(0);
    await page.waitForTimeout(3000);
    expect((await stats(page)).buildingStatuses['b-west-1']).toBe('ruined');
    await page.screenshot({ path: `${VIS}/G3-ruins.png` });
    // 기록 재생: 피해 재적용 없음 (다른 건물 상태 변화 없음, 이벤트 ID 동일)
    const beforeReplay = (await stats(page)).buildingStatuses;
    expect(await ctrl(page, `c.replayLastMissile()`)).toBe(true);
    await expect.poll(async () => (await stats(page)).missilesInFlight, { timeout: 30_000 }).toBe(0);
    expect((await stats(page)).buildingStatuses).toEqual(beforeReplay);
    await expect(page.getByTestId('event-log')).toContainText('피해 재적용 없음');
    // 시험 복구 → 복구 중 → 완공
    await page.getByTestId('close-detail').click().catch(() => {});
    expect(await ctrl(page, `c.repair('b-west-1')`)).toBe(true);
    expect((await stats(page)).buildingStatuses['b-west-1']).toBe('repairing');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${VIS}/G3-repairing.png` });
    // 리셋: 시험 데이터만 복구, 보기 설정(시대)은 유지
    await page.getByTestId('era-stone').click();
    await ctrl(page, `c.fireMissile('b-west-3')`);
    await expect.poll(async () => (await stats(page)).buildingStatuses['b-west-3'], { timeout: 30_000 }).toBe('damaged');
    await page.getByTestId('reset-test').click();
    const r = await stats(page);
    expect(r.buildingStatuses['b-west-3']).toBe('active');
    expect(r.buildingStatuses['b-west-7']).toBe('constructing'); // 초기 fixture 상태 그대로
    expect(await ctrl(page, `c.source.era`)).toBe('stone');
  });

  test('폭발 20회 반복 후 자원 수가 계속 늘지 않음', async ({ page }) => {
    await open(page);
    await ctrl(page, `c.setEffectOptions({shake:false})`);
    const fireUntil = async (n: number) => {
      let fired = 0;
      while (fired < n) {
        const id = await ctrl(page, `c.fireMissile('b-east-0')`);
        if (id) fired++; else await page.waitForTimeout(300);
      }
    };
    await fireUntil(2);
    await expect.poll(async () => (await stats(page)).missilesInFlight, { timeout: 30_000 }).toBe(0);
    await ctrl(page, `c.resetTest()`);
    const base = await stats(page);
    await fireUntil(20);
    await expect.poll(async () => (await stats(page)).missilesInFlight, { timeout: 60_000 }).toBe(0);
    await ctrl(page, `c.resetTest()`);
    await page.waitForTimeout(800);
    const end = await stats(page);
    expect(end.explosionSlots).toBeLessThanOrEqual(2);
    expect(end.missileSlots).toBeLessThanOrEqual(2);
    expect(end.particleSystems).toBe(base.particleSystems);
    expect(end.meshes).toBe(base.meshes);
    expect(end.lights).toBe(base.lights);
    expect(end.materials).toBe(base.materials);
    expect(end.textures).toBe(base.textures);
  });

  test('분대 접근→교전→후퇴 @capture', async ({ page }) => {
    await open(page);
    await page.getByTestId('start-battle').click();
    await ctrl(page, `c.focusPoint(6, 9, 26)`);
    await page.waitForTimeout(6000);
    await page.screenshot({ path: `${VIS}/G3-battle-approach.png` });
    await expect.poll(async () => (await stats(page)).battlePhase, { timeout: 90_000, intervals: [500] }).toBe('engage');
    await ctrl(page, `c.focusPoint(10, 12, 13)`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${VIS}/G3-battle-engage.png` });
    await expect.poll(async () => (await stats(page)).battlePhase, { timeout: 90_000, intervals: [500] }).toBe('retreat');
    await ctrl(page, `c.focusPoint(12, 10, 18)`);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${VIS}/G3-battle-retreat.png` });
    await expect.poll(async () => (await stats(page)).battlePhase, { timeout: 90_000 }).toBe('done');
    const s = await stats(page);
    expect(Math.min(...Object.values(s.strengths))).toBeLessThan(100);
    await page.getByTestId('reset-test').click();
    expect((await stats(page)).battlePhase).toBe('idle');
  });
});

test('1280×720 보조 화면: 전체 보기·패널 닫기 접근 가능', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await open(page);
  await page.locator('[data-resident="r-10"]').click();
  await expect(page.getByTestId('close-detail')).toBeInViewport();
  await expect(page.getByTestId('overview')).toBeInViewport();
  await page.screenshot({ path: `${VIS}/G1-1280x720.png` });
  await page.getByTestId('close-detail').click();
  await page.getByTestId('overview').click();
});
