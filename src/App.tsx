import { ShowcaseScreen } from './screens/ShowcaseScreen';
import { AssetCheckScreen } from './screens/AssetCheckScreen';

// 실제 세계(WorldScreen)는 G4에서 추가. 지금은 showcase 경로만 존재한다.
export default function App() {
  const path = window.location.pathname.replace(/\/+$/, '');
  if (path === '/showcase/assets') return <AssetCheckScreen />;
  return <ShowcaseScreen />;
}
