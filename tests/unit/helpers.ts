import { createShowcaseFixture } from '../../src/fixtures/showcase/baseScene';
import { createNature } from '../../src/fixtures/showcase/nature';
import { buildNavGrid } from '../../src/world3d/terrain/navGrid';
import { VILLAGE_CENTERS } from '../../src/world3d/terrain/layout';

export const fixture = createShowcaseFixture();
export const nature = createNature();
export const nav = buildNavGrid(fixture.buildings, nature, Object.values(VILLAGE_CENTERS).map((c) => ({ ...c, r: 1.3 })));
