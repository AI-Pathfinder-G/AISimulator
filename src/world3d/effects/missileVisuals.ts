// 시험 미사일 메시·연기 꼬리 풀 (최대 동시 수 제한)
import { Color3, Color4, Mesh, MeshBuilder, ParticleSystem, Quaternion, Scene, StandardMaterial, Vector3 } from '@babylonjs/core';
import type { ParticleTextures } from './textures';

interface MSlot { busy: boolean; mesh: Mesh; trail: ParticleSystem; last: Vector3 }

export class MissileVisualPool {
  private slots: MSlot[] = [];
  private scene: Scene; private tex: ParticleTextures; readonly max: number;
  private mat: StandardMaterial; private noseMat: StandardMaterial;
  constructor(scene: Scene, tex: ParticleTextures, max: number) {
    this.scene = scene; this.tex = tex; this.max = max;
    this.mat = new StandardMaterial('missile-body', scene); this.mat.diffuseColor = new Color3(0.85, 0.86, 0.88);
    this.noseMat = new StandardMaterial('missile-nose', scene); this.noseMat.diffuseColor = new Color3(0.8, 0.2, 0.15); this.noseMat.emissiveColor = new Color3(0.2, 0.03, 0.02);
  }
  acquire(): number | null {
    let i = this.slots.findIndex((s) => !s.busy);
    if (i < 0) {
      if (this.slots.length >= this.max) return null;
      const s = this.scene;
      const body = MeshBuilder.CreateCylinder('missile-b', { diameter: 0.35, height: 1.6, tessellation: 10 }, s); body.material = this.mat;
      const nose = MeshBuilder.CreateCylinder('missile-n', { diameterTop: 0, diameterBottom: 0.35, height: 0.5, tessellation: 10 }, s); nose.position.y = 1.05; nose.material = this.noseMat;
      const fins = MeshBuilder.CreateBox('missile-f', { width: 0.8, height: 0.35, depth: 0.05 }, s); fins.position.y = -0.65; fins.material = this.noseMat;
      const fins2 = fins.clone('missile-f2'); fins2.rotation.y = Math.PI / 2;
      const mesh = Mesh.MergeMeshes([body, nose, fins, fins2], true, true, undefined, false, true)!;
      mesh.name = `missile-${this.slots.length}`; mesh.isPickable = false; mesh.setEnabled(false);
      const trail = new ParticleSystem(`missile-trail-${this.slots.length}`, 400, s);
      trail.particleTexture = this.tex.smoke; trail.emitter = Vector3.Zero();
      trail.color1 = new Color4(0.92, 0.92, 0.92, 0.7); trail.color2 = new Color4(0.8, 0.8, 0.8, 0.5); trail.colorDead = new Color4(0.7, 0.7, 0.7, 0);
      trail.minSize = 0.4; trail.maxSize = 0.9; trail.minLifeTime = 1.2; trail.maxLifeTime = 2; trail.emitRate = 160;
      trail.minEmitPower = 0.1; trail.maxEmitPower = 0.3; trail.blendMode = ParticleSystem.BLENDMODE_STANDARD;
      this.slots.push({ busy: false, mesh, trail, last: Vector3.Zero() });
      i = this.slots.length - 1;
    }
    const sl = this.slots[i];
    sl.busy = true; sl.mesh.setEnabled(true); sl.trail.reset(); sl.trail.start();
    return i;
  }
  place(i: number, p: Vector3, frozen: boolean) {
    const s = this.slots[i];
    const dir = p.subtract(s.last);
    s.mesh.position.copyFrom(p);
    if (dir.lengthSquared() > 1e-6) {
      // 진행 방향으로 기울이기 (기본 +Y 축)
      const d = dir.normalize();
      const axis = Vector3.Cross(Vector3.Up(), d);
      const ang = Math.acos(Math.min(1, Math.max(-1, Vector3.Dot(Vector3.Up(), d))));
      if (axis.lengthSquared() > 1e-8) s.mesh.rotationQuaternion = Quaternion.RotationAxis(axis.normalize(), ang);
    }
    s.last.copyFrom(p);
    (s.trail.emitter as Vector3).copyFrom(p);
    s.trail.updateSpeed = frozen ? 0 : 0.016;
  }
  release(i: number) { const s = this.slots[i]; s.busy = false; s.mesh.setEnabled(false); s.trail.stop(); }
  hideMesh(i: number) { const s = this.slots[i]; s.mesh.setEnabled(false); s.trail.stop(); }
  reset() { this.slots.forEach((s) => { s.busy = false; s.mesh.setEnabled(false); s.trail.stop(); s.trail.reset(); }); }
  get slotCount() { return this.slots.length; }
  get activeParticles() { return this.slots.reduce((a, s) => a + s.trail.getActiveCount(), 0); }
  dispose() { this.slots.forEach((s) => { s.mesh.dispose(); s.trail.dispose(); }); this.slots = []; this.mat.dispose(); this.noseMat.dispose(); }
}

