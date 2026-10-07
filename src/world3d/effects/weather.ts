// 비·눈·폭풍 (설계문서 6.3): 카메라 주변 제한 입자, 지형/인물을 가리지 않는 밀도, 번개는 짧고 반복 점멸 없음
import { Color3, Color4, ParticleSystem, Scene, Vector3, type ArcRotateCamera } from '@babylonjs/core';
import type { WeatherKind } from '../../shared/render-contracts';
import type { ParticleTextures } from './textures';
import { mulberry32 } from '../../shared/rng';

export interface WeatherOptions { flash: boolean; reducedMotion: boolean; particleBudget: number; frozen: boolean }

export class WeatherSystem {
  kind: WeatherKind = 'clear';
  private rain: ParticleSystem;
  private snow: ParticleSystem;
  private camera: ArcRotateCamera;
  private nextLightning = 6;
  private lightningT = -1;
  /** 0~1: 현재 번개 밝기 (조명 계산에 더함) */
  flashLevel = 0;
  private rnd = mulberry32(99); // 시각 전용 난수
  lightningCount = 0;

  constructor(scene: Scene, camera: ArcRotateCamera, tex: ParticleTextures) {
    this.camera = camera;
    this.rain = new ParticleSystem('rain', 3000, scene);
    this.rain.particleTexture = tex.streak;
    this.rain.emitter = new Vector3(0, 20, 0);
    this.rain.minEmitBox = new Vector3(-22, 0, -22);
    this.rain.maxEmitBox = new Vector3(22, 6, 22);
    this.rain.direction1 = new Vector3(-0.6, -18, 0.2);
    this.rain.direction2 = new Vector3(-0.2, -22, 0.6);
    this.rain.minLifeTime = 0.9; this.rain.maxLifeTime = 1.2;
    this.rain.minSize = 0.7; this.rain.maxSize = 1.1;
    this.rain.minScaleX = 0.08; this.rain.maxScaleX = 0.1;
    this.rain.billboardMode = ParticleSystem.BILLBOARDMODE_STRETCHED;
    this.rain.color1 = new Color4(0.8, 0.86, 1, 0.7);
    this.rain.color2 = new Color4(0.7, 0.78, 0.9, 0.4);
    this.rain.colorDead = new Color4(0.7, 0.78, 0.9, 0);
    this.rain.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    this.rain.minEmitPower = 1; this.rain.maxEmitPower = 1.2;
    this.rain.updateSpeed = 1 / 60;

    this.snow = new ParticleSystem('snow', 2000, scene);
    this.snow.particleTexture = tex.soft;
    this.snow.emitter = new Vector3(0, 14, 0);
    this.snow.minEmitBox = new Vector3(-24, 0, -24);
    this.snow.maxEmitBox = new Vector3(24, 4, 24);
    this.snow.direction1 = new Vector3(-0.4, -1.2, -0.3);
    this.snow.direction2 = new Vector3(0.4, -1.6, 0.3);
    this.snow.minLifeTime = 7; this.snow.maxLifeTime = 9;
    this.snow.minSize = 0.12; this.snow.maxSize = 0.24;
    this.snow.color1 = new Color4(1, 1, 1, 0.9);
    this.snow.color2 = new Color4(0.95, 0.97, 1, 0.75);
    this.snow.colorDead = new Color4(1, 1, 1, 0);
    this.snow.minAngularSpeed = -1; this.snow.maxAngularSpeed = 1;
    this.snow.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    this.snow.minEmitPower = 1; this.snow.maxEmitPower = 1.3;
  }

  set(kind: WeatherKind, opt: WeatherOptions) {
    this.kind = kind;
    const budget = opt.particleBudget;
    this.rain.stop(); this.snow.stop();
    this.rain.reset(); this.snow.reset();
    if (kind === 'rain' || kind === 'storm') {
      this.rain.emitRate = Math.min(budget, kind === 'storm' ? 2600 : 1500);
      this.rain.direction1.x = kind === 'storm' ? -4 : -0.6; this.rain.direction2.x = kind === 'storm' ? -3 : -0.2;
      this.rain.start();
    } else if (kind === 'snow') {
      this.snow.emitRate = Math.min(budget / 8, 260);
      this.snow.start();
      this.snow.manualEmitCount = Math.min(1500, budget / 2); // 시작부터 화면에 눈
    }
    this.nextLightning = 3;
  }

  get activeParticles(): number { return this.rain.getActiveCount() + this.snow.getActiveCount(); }

  update(dt: number, opt: WeatherOptions) {
    const t = this.camera.target;
    (this.rain.emitter as Vector3).set(t.x, t.y + 18, t.z);
    (this.snow.emitter as Vector3).set(t.x, t.y + 12, t.z);
    const frozen = opt.frozen;
    this.rain.updateSpeed = frozen ? 0 : 1 / 60;
    this.snow.updateSpeed = frozen ? 0 : 0.01;
    this.flashLevel = 0;
    if (this.kind !== 'storm' || !opt.flash || opt.reducedMotion) { this.lightningT = -1; return; }
    if (frozen) return;
    this.nextLightning -= dt;
    if (this.nextLightning <= 0) { this.lightningT = 0; this.nextLightning = 5 + this.rnd() * 6; this.lightningCount++; }
    if (this.lightningT >= 0) {
      this.lightningT += dt;
      // 짧은 두 번의 섬광 (총 0.35초), 전체 화면 흰색 반복 아님
      const l = this.lightningT;
      this.flashLevel = l < 0.08 ? 0.8 : l < 0.16 ? 0.15 : l < 0.24 ? 0.55 : l < 0.35 ? 0.1 : 0;
      if (l > 0.35) this.lightningT = -1;
    }
  }

  dispose() { this.rain.dispose(); this.snow.dispose(); }
}

export const WEATHER_TINT: Record<WeatherKind, { light: number; sky: Color3; fog: number }> = {
  clear: { light: 1, sky: new Color3(1, 1, 1), fog: 0.0 },
  rain: { light: 0.72, sky: new Color3(0.68, 0.72, 0.78), fog: 0.006 },
  snow: { light: 0.9, sky: new Color3(0.9, 0.92, 0.96), fog: 0.007 },
  storm: { light: 0.5, sky: new Color3(0.45, 0.48, 0.55), fog: 0.012 },
};
