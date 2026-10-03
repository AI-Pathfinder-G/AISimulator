import { WorldCanvas } from '../world3d/WorldCanvas';

export const ShowcaseScreen = () => {
  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ flex: 3 }}>
        <WorldCanvas />
      </div>
      <div style={{ flex: 1, padding: '1rem', backgroundColor: '#f0f0f0', overflowY: 'auto' }}>
        <h2>선택된 주민</h2>
        <div id="resident-info">없음</div>
        <h2>제어</h2>
        <button onClick={() => alert('카메라 초기화')}>초기 화면</button>
      </div>
    </div>
  );
};