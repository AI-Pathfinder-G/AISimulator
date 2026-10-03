import { useState } from 'react';
import { WorldCanvas } from '../world3d/WorldCanvas';

type Weather = 'clear' | 'rain' | 'snow' | 'storm';
type Era = 'agrarian' | 'stone' | 'modern';

export const ShowcaseScreen = () => {
  const [selectedResidentId, setSelectedResidentId] = useState<string | null>(null);
  const [weather, setWeather] = useState<Weather>('clear');
  const [era, setEra] = useState<Era>('agrarian');

  return (
    <div style={{ display: 'flex', height: '100vh', flexDirection: 'column' }}>
      <div style={{ 
        backgroundColor: '#fff3cd', 
        color: '#856404', 
        padding: '0.5rem', 
        textAlign: 'center',
        fontSize: '0.9rem',
        borderBottom: '1px solid #ffeaa7'
      }}>
        연출 검증 모드 · 실제 세계 저장 없음
      </div>
      <div style={{ flex: 1, display: 'flex' }}>
        <div style={{ flex: 3 }}>
          <WorldCanvas 
            onResidentSelect={setSelectedResidentId}
            weather={weather}
            era={era}
            mode="showcase"
            combatActive={false}
            missileActive={false}
          />
        </div>
        <div style={{ flex: 1, padding: '1rem', backgroundColor: '#f0f0f0', overflowY: 'auto' }}>
          <h2>선택된 주민</h2>
          <div id="resident-info">{selectedResidentId ?? '없음'}</div>
          <h2>날씨</h2>
          <div>
            <button onClick={() => setWeather('clear')} style={{ margin: '0.2rem' }}>맑음</button>
            <button onClick={() => setWeather('rain')} style={{ margin: '0.2rem' }}>비</button>
            <button onClick={() => setWeather('snow')} style={{ margin: '0.2rem' }}>눈</button>
            <button onClick={() => setWeather('storm')} style={{ margin: '0.2rem' }}>폭풍</button>
          </div>
          <h2>시대</h2>
          <div>
            <button onClick={() => setEra('agrarian')} style={{ margin: '0.2rem' }}>농경 마을</button>
            <button onClick={() => setEra('stone')} style={{ margin: '0.2rem' }}>석조 도시</button>
            <button onClick={() => setEra('modern')} style={{ margin: '0.2rem' }}>현대 도시</button>
          </div>
          <h2>연출 제어</h2>
          <div>
            <button 
              onClick={() => alert('전투 시작 (준비 중)')}
              style={{ margin: '0.2rem', backgroundColor: '#ffebee', color: '#c62828' }}
            >
              전투 시작
            </button>
            <button 
              onClick={() => alert('미사일 발사 (준비 중)')}
              style={{ margin: '0.2rem', backgroundColor: '#fff3e0', color: '#ef6c00' }}
            >
              미사일 발사
            </button>
          </div>
          <h2>기타 제어</h2>
          <button onClick={() => alert('카메라 초기화')}>초기 화면</button>
        </div>
      </div>
    </div>
  );
};