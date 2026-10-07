// 품질 프리셋 (설계문서 10.2) — 조정 가능한 설계값, 보장치 아님
export type QualityLevel = 'low' | 'medium';
export const QUALITY: Record<QualityLevel, { label: string; renderScale: number; shadowMap: number; particleBudget: number; bigExplosions: number }> = {
  low: { label: 'Low', renderScale: 0.75, shadowMap: 1024, particleBudget: 1000, bigExplosions: 1 },
  medium: { label: 'Medium (기본)', renderScale: 1, shadowMap: 2048, particleBudget: 3000, bigExplosions: 2 },
};
