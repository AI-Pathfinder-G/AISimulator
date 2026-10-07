// React 생명주기: 캔버스 1개, Engine 1개. 언마운트 때 루프·이벤트·GPU 리소스 해제 (설계문서 7.3)
import { useEffect, useRef } from 'react';
import { createShowcaseScene, WebGLUnavailableError, type SceneCallbacks, type ShowcaseController } from './createScene';
import { installSceneTestHook } from './sceneTestHook';

interface Props {
  callbacks: SceneCallbacks;
  onController: (c: ShowcaseController | null) => void;
  onFatal: (msg: string) => void;
}

export function WorldCanvas({ callbacks, onController, onFatal }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cbRef = useRef(callbacks);
  useEffect(() => { cbRef.current = callbacks; }, [callbacks]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let ctrl: ShowcaseController | null = null;
    try {
      ctrl = createShowcaseScene(canvas, {
        onReady: () => cbRef.current.onReady?.(),
        onProgress: (d, t) => cbRef.current.onProgress?.(d, t),
        onSelect: (s) => cbRef.current.onSelect?.(s),
        onLog: (e) => cbRef.current.onLog?.(e),
        onError: (m) => cbRef.current.onError?.(m),
      });
    } catch (e) {
      onFatal(e instanceof WebGLUnavailableError ? e.message : `3D 장면 생성 실패: ${(e as Error).message}`);
      return;
    }
    onController(ctrl);
    const uninstall = import.meta.env.DEV ? installSceneTestHook(ctrl) : () => {};
    return () => { uninstall(); onController(null); ctrl?.dispose(); };
  }, [onController, onFatal]);

  return <canvas ref={ref} className="world-canvas" data-testid="world-canvas" touch-action="none" />;
}
