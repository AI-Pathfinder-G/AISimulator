// 개발 전용 관찰 훅 window.__SCENE_TEST__ (production 빌드에서는 import.meta.env.DEV 분기로 제거됨, 설계문서 13.2)
import { Engine } from '@babylonjs/core';
import type { Selection, ShowcaseController } from './createScene';

export interface SceneTestHook {
  ready: boolean;
  controller: ShowcaseController;
  engineCount(): number;
  stats(): ReturnType<ShowcaseController['stats']>;
  residentIds(): string[];
  resident(id: string): ReturnType<ShowcaseController['describeResident']>;
  project(s: Selection): { x: number; y: number } | null;
  selected: Selection | null;
}

declare global { interface Window { __SCENE_TEST__?: SceneTestHook } }

export function installSceneTestHook(c: ShowcaseController): () => void {
  const hook: SceneTestHook = {
    ready: false, controller: c, selected: null,
    engineCount: () => Engine.Instances.length,
    stats: () => c.stats(),
    residentIds: () => c.source.bundle().residents.map((r) => r.id),
    resident: (id) => c.describeResident(id),
    project: (s) => c.projectToScreen(s),
  };
  window.__SCENE_TEST__ = hook;
  c.ready.then((ok) => { if (window.__SCENE_TEST__ === hook) hook.ready = ok; });
  return () => { if (window.__SCENE_TEST__ === hook) delete window.__SCENE_TEST__; };
}
