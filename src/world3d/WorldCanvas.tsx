import { useRef, useEffect } from 'react';
import * as BABYLON from '@babylonjs/core';
import { createScene } from './createScene';

interface WorldCanvasProps {
  onResidentSelect: (residentId: string | null) => void;
  weather: 'clear' | 'rain' | 'snow' | 'storm';
  era: 'agrarian' | 'stone' | 'modern';
  mode: 'showcase' | 'simulation';
  combatActive: boolean;
  missileActive: boolean;
}

export const WorldCanvas = ({ 
  onResidentSelect, 
  weather, 
  era,
  mode,
  combatActive, 
  missileActive 
}: WorldCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new BABYLON.Engine(canvas, true);
    const scene = createScene(
      engine,
      canvas,
      onResidentSelect,
      weather,
      era,
      mode,
      combatActive,
      missileActive
    );

    // Run the render loop
    engine.runRenderLoop(() => {
      scene.render();
    });

    // Resize
    window.addEventListener('resize', () => {
      engine.resize();
    });

    // Cleanup
    return () => {
      engine.dispose();
      scene.dispose();
      window.removeEventListener('resize', () => {
        engine.resize();
      });
    };
  }, [onResidentSelect, weather, era, mode, combatActive, missileActive]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
};