// 재사용 폭발 효과 풀 + 최대 동시 수 (설계문서 6.4, 7.3). 반복 폭발 후 입자·메시·광원 수가 늘지 않는다.
import { Color3, Color4, Mesh, MeshBuilder, ParticleSystem, PointLight, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { ParticleTextures } from './textures';
import { mulberry32 } from '../../shared/rng';

export const FLASH_TIME = 0.35;
export const RING_TIME = 0.9;
export const FIRE_TIME = 7;
export const SMOKE_TIME = 9;

interface Slot {
  busy: boolean; t: number; pos: Vector3;
  flash: Mesh; ring: Mesh; light: PointLight;
  fireball: ParticleSystem; fire: ParticleSystem; smoke: ParticleSystem;
  debris: Mesh[]; vel: Vector3[];
}

export class ExplosionPool {
  private slots: Slot[] = [];
  private scene: Scene;
  private tex: ParticleTextures;
  maxConcurrent: number;
  private mats: { flash: StandardMaterial; ring: StandardMaterial; debris: StandardMaterial };
  private rnd = mulberry32(4242);
  triggered = 0;
  rejected = 0;

  constructor(scene: Scene, tex: ParticleTextures, maxConcurrent: number) {
    this.scene = scene; this.tex = tex; this.maxConcurrent = maxConcurrent;
    const flash = new StandardMaterial('fx-flash', scene); flash.emissiveColor = new Color3(1, 0.85, 0.5); flash.disableLighting = true; flash.alpha = 0.9;
    const ring = new StandardMaterial('fx-ring', scene); ring.emissiveColor = new Color3(1, 0.55, 0.2); ring.disableLighting = true; ring.alpha = 0.8;
    const debris = new StandardMaterial('fx-debris', scene); debris.diffuseColor = new Color3(0.2, 0.18, 0.16); debris.specularColor = Color3.Black();
    this.mats = { flash, ring, debris };
  }

  private makeSlot(i: number): Slot {
    const s = this.scene;
    const flash = MeshBuilder.CreateSphere(`fx-flash-${i}`, { diameter: 1, segments: 8 }, s); flash.material = this.mats.flash; flash.isPickable = false; flash.setEnabled(false);
    const ring = MeshBuilder.CreateTorus(`fx-ring-${i}`, { diameter: 1, thickness: 0.12, tessellation: 24 }, s); ring.material = this.mats.ring; ring.isPickable = false; ring.setEnabled(false);
    const light = new PointLight(`fx-light-${i}`, Vector3.Zero(), s); light.diffuse = new Color3(1, 0.6, 0.3); light.intensity = 0; light.range = 18;
    const ps = (name: string, cap: number) => { const p = new ParticleSystem(`${name}-${i}`, cap, s); p.emitter = Vector3.Zero(); return p; };
    const fireball = ps('fx-fireball', 260);
    fireball.particleTexture = this.tex.soft; fireball.blendMode = ParticleSystem.BLENDMODE_ADD;
    fireball.color1 = new Color4(1, 0.8, 0.3, 1); fireball.color2 = new Color4(1, 0.4, 0.1, 1); fireball.colorDead = new Color4(0.3, 0.1, 0, 0);
    fireball.minSize = 0.8; fireball.maxSize = 2.2; fireball.minLifeTime = 0.3; fireball.maxLifeTime = 0.8;
    fireball.createSphereEmitter(0.6); fireball.minEmitPower = 3; fireball.maxEmitPower = 7; fireball.emitRate = 0; fireball.targetStopDuration = 0;
    const fire = ps('fx-fire', 160);
    fire.particleTexture = this.tex.soft; fire.blendMode = ParticleSystem.BLENDMODE_ADD;
    fire.color1 = new Color4(1, 0.6, 0.2, 0.9); fire.color2 = new Color4(1, 0.35, 0.05, 0.8); fire.colorDead = new Color4(0.2, 0.05, 0, 0);
    fire.minSize = 0.4; fire.maxSize = 1.1; fire.minLifeTime = 0.4; fire.maxLifeTime = 0.9;
    fire.createCylinderEmitter(1.1, 0.4, 0.4); fire.minEmitPower = 0.8; fire.maxEmitPower = 1.6; fire.gravity = new Vector3(0, 2.5, 0); fire.emitRate = 90;
    const smoke = ps('fx-smoke', 220);
    smoke.particleTexture = this.tex.smoke; smoke.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    smoke.color1 = new Color4(0.25, 0.24, 0.24, 0.55); smoke.color2 = new Color4(0.4, 0.38, 0.36, 0.45); smoke.colorDead = new Color4(0.5, 0.5, 0.5, 0);
    smoke.minSize = 1; smoke.maxSize = 2.6; smoke.minLifeTime = 2.5; smoke.maxLifeTime = 4.5;
    smoke.createCylinderEmitter(1, 0.5, 0.5); smoke.minEmitPower = 0.6; smoke.maxEmitPower = 1.2; smoke.gravity = new Vector3(0.3, 1.2, 0); smoke.emitRate = 40;
    smoke.minAngularSpeed = -0.5; smoke.maxAngularSpeed = 0.5;
    const debris: Mesh[] = [], vel: Vector3[] = [];
    for (let k = 0; k < 8; k++) {
      const d = MeshBuilder.CreateBox(`fx-debris-${i}-${k}`, { size: 0.18 }, s); d.material = this.mats.debris; d.isPickable = false; d.setEnabled(false);
      debris.push(d); vel.push(Vector3.Zero());
    }
    return { busy: false, t: 0, pos: Vector3.Zero(), flash, ring, light, fireball, fire, smoke, debris, vel };
  }

  /** 슬롯이 없으면 false (호출자는 연출을 생략하고 기록만 남김) */
  trigger(pos: Vector3): boolean {
    let slot = this.slots.find((x) => !x.busy);
    if (!slot) {
      if (this.slots.length >= this.maxConcurrent) { this.rejected++; return false; }
      slot = this.makeSlot(this.slots.length);
      this.slots.push(slot);
    }
    this.triggered++;
    slot.busy = true; slot.t = 0; slot.pos.copyFrom(pos);
    slot.flash.position.copyFrom(pos); slot.flash.setEnabled(true);
    slot.ring.position.copyFrom(pos).addInPlaceFromFloats(0, 0.2, 0); slot.ring.setEnabled(true);
    slot.light.position.copyFrom(pos).addInPlaceFromFloats(0, 2, 0);
    for (const p of [slot.fireball, slot.fire, slot.smoke]) { p.emitter = pos.clone(); p.reset(); }
    slot.fireball.manualEmitCount = 160; slot.fireball.start();
    slot.fire.start(); slot.smoke.start();
    slot.debris.forEach((d, k) => {
      d.setEnabled(true); d.position.copyFrom(pos).addInPlaceFromFloats(0, 0.5, 0);
      const a = (k / 8) * Math.PI * 2 + this.rnd();
      slot!.vel[k].set(Math.cos(a) * (3 + this.rnd() * 3), 5 + this.rnd() * 4, Math.sin(a) * (3 + this.rnd() * 3));
    });
    return true;
  }

  update(dt: number, frozen: boolean, flashEnabled: boolean) {
    for (const s of this.slots) {
      for (const p of [s.fireball, s.fire, s.smoke]) p.updateSpeed = frozen ? 0 : 0.016;
      if (!s.busy || frozen) continue;
      s.t += dt;
      const ft = s.t / FLASH_TIME;
      s.flash.setEnabled(ft < 1 && flashEnabled);
      s.flash.scaling.setAll(1 + 5 * Math.min(1, ft));
      this.mats.flash.alpha = Math.max(0, 0.9 * (1 - ft));
      s.light.intensity = flashEnabled ? Math.max(0, 6 * (1 - s.t / 0.6)) : 0;
      const rt = s.t / RING_TIME;
      s.ring.setEnabled(rt < 1);
      s.ring.scaling.setAll(1 + 10 * rt);
      s.ring.scaling.y = 1;
      if (s.t > FIRE_TIME) s.fire.stop();
      if (s.t > SMOKE_TIME * 0.7) s.smoke.stop();
      s.debris.forEach((d, k) => {
        if (!d.isEnabled()) return;
        s.vel[k].y -= 14 * dt;
        d.position.addInPlace(s.vel[k].scale(dt));
        d.rotation.x += dt * 5; d.rotation.z += dt * 3;
        if (d.position.y < s.pos.y - 0.2 || s.t > 2.5) d.setEnabled(false);
      });
      if (s.t > SMOKE_TIME) {
        s.busy = false;
        s.fire.stop(); s.smoke.stop(); s.flash.setEnabled(false); s.ring.setEnabled(false); s.light.intensity = 0;
      }
    }
  }

  reset() {
    for (const s of this.slots) {
      s.busy = false; s.fire.stop(); s.smoke.stop(); s.fireball.stop();
      [s.fire, s.smoke, s.fireball].forEach((p) => p.reset());
      s.flash.setEnabled(false); s.ring.setEnabled(false); s.light.intensity = 0; s.debris.forEach((d) => d.setEnabled(false));
    }
  }

  get busyCount() { return this.slots.filter((s) => s.busy).length; }
  get slotCount() { return this.slots.length; }
  get activeParticles() { return this.slots.reduce((a, s) => a + s.fire.getActiveCount() + s.smoke.getActiveCount() + s.fireball.getActiveCount(), 0); }

  dispose() {
    for (const s of this.slots) { s.flash.dispose(); s.ring.dispose(); s.light.dispose(); s.fireball.dispose(); s.fire.dispose(); s.smoke.dispose(); s.debris.forEach((d) => d.dispose()); }
    this.slots = [];
    Object.values(this.mats).forEach((m) => m.dispose());
  }
}
