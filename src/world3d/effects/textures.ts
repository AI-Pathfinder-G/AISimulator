// 입자용 절차 텍스처 (외부 CDN 의존 없음)
import { DynamicTexture, Scene } from '@babylonjs/core';

export function makeParticleTextures(scene: Scene) {
  const make = (name: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    const t = new DynamicTexture(name, { width: w, height: h }, scene, false);
    t.hasAlpha = true;
    const ctx = t.getContext() as unknown as CanvasRenderingContext2D;
    ctx.clearRect(0, 0, w, h);
    draw(ctx);
    t.update();
    return t;
  };
  const radial = (ctx: CanvasRenderingContext2D, s: number, stops: Array<[number, string]>) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  };
  return {
    soft: make('tex-soft', 64, 64, (c) => radial(c, 64, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.5)'], [1, 'rgba(255,255,255,0)']])),
    smoke: make('tex-smoke', 64, 64, (c) => radial(c, 64, [[0, 'rgba(255,255,255,0.9)'], [0.6, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']])),
    streak: make('tex-streak', 8, 64, (c) => { const g = c.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(2, 0, 4, 64); }),
  };
}
export type ParticleTextures = ReturnType<typeof makeParticleTextures>;
