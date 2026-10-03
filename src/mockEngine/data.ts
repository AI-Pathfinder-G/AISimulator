// Mock data for the simulation mode
export type ResidentV0 = {
  id: string;
  name: string;
  job: string;
  villageId: 'village1' | 'village2';
  health: number; // 0-100
};

export type Resident = {
  id: string;
  name: string;
  job: string;
  villageId: 'village1' | 'village2';
  health: number; // 0-100
  // New field in v1: lastUpdated timestamp (for example)
  lastUpdated: number;
};

export type Village = {
  id: 'village1' | 'village2';
  name: string;
  residentIds: string[];
  resources: {
    food: number;
    wood: number;
    stone: number;
  };
};

export type Building = {
  id: string;
  villageId: 'village1' | 'village2';
  type: 'house' | 'farm' | 'storage' | 'townHall';
  position: {
    x: number;
    y: number;
    z: number;
  };
  health: number; // 0-100
  isConstructing: boolean;
};

export type WorldDataV0 = {
  day: number;
  residents: ResidentV0[];
  villages: Village[];
  buildings: Building[];
};

export type WorldData = {
  schemaVersion: number; // 1 for current version
  day: number;
  residents: Resident[];
  villages: Village[];
  buildings: Building[];
};

// Migration from v0 to v1
export const migrateWorldDataV0ToV1 = (oldData: WorldDataV0): WorldData => {
  const now = Date.now();
  return {
    schemaVersion: 1,
    day: oldData.day,
    residents: oldData.residents.map(res => ({
      id: res.id,
      name: res.name,
      job: res.job,
      villageId: res.villageId,
      health: res.health,
      lastUpdated: now, // set migration time as lastUpdated
    })),
    villages: oldData.villages,
    buildings: oldData.buildings,
  };
};

// Generate mock data for v0 (old schema)
export const generateMockWorldDataV0 = (day: number): WorldDataV0 => {
  const residents: ResidentV0[] = [];
  const villages: Village[] = [
    {
      id: 'village1',
      name: '북마을',
      residentIds: [],
      resources: { food: 100, wood: 50, stone: 30 },
    },
    {
      id: 'village2',
      name: '남마을',
      residentIds: [],
      resources: { food: 80, wood: 40, stone: 20 },
    },
  ];
  const buildings: Building[] = [];

  // Create 24 residents
  for (let i = 0; i < 24; i++) {
    const villageId = i < 12 ? 'village1' : 'village2';
    const resident: ResidentV0 = {
      id: `resident_${i}`,
      name: `주민${i + 1}`,
      job: i % 3 === 0 ? '농부' : i % 3 === 1 ? '목수' : '돌공',
      villageId,
      health: 100 - (i % 10), // slight variation
    };
    residents.push(resident);
    if (villageId === 'village1') {
      villages[0].residentIds.push(resident.id);
    } else {
      villages[1].residentIds.push(resident.id);
    }
  }

  // Create some buildings for each village
  // Village 1: houses in a cluster
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      if (Math.random() > 0.2) {
        const building: Building = {
          id: `v1_building_${i}_${j}`,
          villageId: 'village1',
          type: 'house',
          position: {
            x: -6 + i * 1.5,
            y: 0.5,
            z: -6 + j * 1.5,
          },
          health: 100,
          isConstructing: false,
        };
        buildings.push(building);
      }
    }
  }
  // Village 1: town hall
  buildings.push({
    id: 'v1_townhall',
    villageId: 'village1',
    type: 'townHall',
    position: { x: -6, y: 1, z: -6 },
    health: 100,
    isConstructing: false,
  });

  // Village 2: houses in a cluster
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 3; j++) {
      if (Math.random() > 0.2) {
        const building: Building = {
          id: `v2_building_${i}_${j}`,
          villageId: 'village2',
          type: 'house',
          position: {
            x: 6 + i * 1.5,
            y: 0.5,
            z: 6 + j * 1.5,
          },
          health: 100,
          isConstructing: false,
        };
        buildings.push(building);
      }
    }
  }
  // Village 2: town hall
  buildings.push({
    id: 'v2_townhall',
    villageId: 'village2',
    type: 'townHall',
    position: { x: 6, y: 1, z: 6 },
    health: 100,
    isConstructing: false,
  });

  return {
    day,
    residents,
    villages,
    buildings,
  };
};

// Generate mock data for v1 (current schema) - we can also generate directly
export const generateMockWorldData = (day: number): WorldData => {
  const v0Data = generateMockWorldDataV0(day);
  return migrateWorldDataV0ToV1(v0Data);
};

// For showcase mode, we use a fixed day (day 0) to have consistent data
export const showcaseData = generateMockWorldData(0);

// For simulation mode, we can generate data for the current day
// In a real engine, this would update over time. We'll just use the current day from a mock clock.
let simulationDay = 0;
export const getSimulationWorldData = (): WorldData => {
  // In a real scenario, this would advance the day based on time.
  // For now, we'll just return data for day 0 as well, but we could increment if we had a timer.
  return generateMockWorldData(simulationDay);
};

// Function to advance the simulation day (called externally)
export const advanceSimulationDay = (): void => {
  simulationDay += 1;
};