// 낮/석양/밤 프리셋과 부드러운 전환 (설계문서 6.3)
import { Color3, Vector3 } from '@babylonjs/core';
import type { TimeOfDay } from '../../shared/render-contracts';

export interface LightPreset { sunDir: Vector3; sunColor: Color3; sunIntensity: number; hemiColor: Color3; hemiGround: Color3; hemiIntensity: number; sky: Color3; windowGlow: number }

export const DAYLIGHT: Record<TimeOfDay, LightPreset> = {
  day: { sunDir: new Vector3(-0.45, -1, 0.35), sunColor: new Color3(1, 0.97, 0.9), sunIntensity: 1.6, hemiColor: new Color3(0.85, 0.9, 1), hemiGround: new Color3(0.35, 0.33, 0.28), hemiIntensity: 0.75, sky: new Color3(0.58, 0.78, 0.95), windowGlow: 0 },
  sunset: { sunDir: new Vector3(-1, -0.32, 0.25), sunColor: new Color3(1, 0.62, 0.35), sunIntensity: 1.3, hemiColor: new Color3(0.95, 0.7, 0.6), hemiGround: new Color3(0.3, 0.2, 0.2), hemiIntensity: 0.55, sky: new Color3(0.95, 0.6, 0.45), windowGlow: 0.45 },
  night: { sunDir: new Vector3(0.3, -1, -0.4), sunColor: new Color3(0.55, 0.65, 1), sunIntensity: 0.35, hemiColor: new Color3(0.45, 0.55, 0.9), hemiGround: new Color3(0.12, 0.12, 0.18), hemiIntensity: 0.45, sky: new Color3(0.06, 0.09, 0.18), windowGlow: 1 },
};

export function lerpPreset(a: LightPreset, b: LightPreset, t: number): LightPreset {
  const k = Math.min(1, Math.max(0, t));
  return {
    sunDir: Vector3.Lerp(a.sunDir, b.sunDir, k).normalize(),
    sunColor: Color3.Lerp(a.sunColor, b.sunColor, k),
    sunIntensity: a.sunIntensity + (b.sunIntensity - a.sunIntensity) * k,
    hemiColor: Color3.Lerp(a.hemiColor, b.hemiColor, k),
    hemiGround: Color3.Lerp(a.hemiGround, b.hemiGround, k),
    hemiIntensity: a.hemiIntensity + (b.hemiIntensity - a.hemiIntensity) * k,
    sky: Color3.Lerp(a.sky, b.sky, k),
    windowGlow: a.windowGlow + (b.windowGlow - a.windowGlow) * k,
  };
}
