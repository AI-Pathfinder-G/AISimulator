# 에셋 출처·라이선스

모든 3D 에셋은 Kenney(www.kenney.nl)의 무료 개별 다운로드(CC0 1.0, 공개 도메인)입니다. 유료 All-in-1 번들은 구매하지 않았습니다. 출처 기준은 공식 제품 페이지입니다.

| 팩 | 공식 페이지 | 버전 | 로컬 경로 | 수정 |
|---|---|---|---|---|
| Mini Characters | https://kenney.nl/assets/mini-characters | 1.0 | public/assets/characters/ (8개 캐릭터 + colormap.png) | 없음 |
| Fantasy Town Kit | https://kenney.nl/assets/fantasy-town-kit | 2.0 | public/assets/town/ (벽·지붕·나무·바위·소품 등) | 없음 |
| City Kit (Suburban) | https://kenney.nl/assets/city-kit-suburban | 2.0 | public/assets/suburban/ (주택 7종·화분·나무) | 없음 |

- 파일별 sha256, 실제 클립 목록, 클립 매핑은 `public/assets/asset-manifest.json` (`npm run assets:manifest`로 재생성, `npm run doctor`로 검증).
- 압축 내부에 실행 파일·경로 이탈 항목이 없는 것을 확인한 후 사용한 파일만 복사했습니다.
- 캐릭터 클립 매핑(실제 GLB 조사): idle→`idle`, walk→`walk`, run→`sprint`, work→`interact-right`, attack→`holding-right-shoot`, hit→**없음**(절차적 몸 젖힘으로 대체).
- 무기 모델은 팩에 없어 단순 막대(절차 형상)로 표시합니다.
