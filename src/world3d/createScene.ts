import * as BABYLON from '@babylonjs/core';

export const createScene = (
  engine: BABYLON.Engine,
  canvas: HTMLCanvasElement,
  onResidentSelect: (residentId: string | null) => void,
  weather: 'clear' | 'rain' | 'snow' | 'storm',
  era: 'agrarian' | 'stone' | 'modern',
  mode: 'showcase' | 'simulation',
  combatActive: boolean,
  missileActive: boolean
) => {
  const scene = new BABYLON.Scene(engine);

  // Use weather to set clear color
  let clearColor: BABYLON.Color4;
  switch (weather) {
    case 'clear':
      clearColor = new BABYLON.Color4(0.6, 0.8, 1.0, 1.0); // light blue
      break;
    case 'rain':
      clearColor = new BABYLON.Color4(0.4, 0.5, 0.7, 1.0); // darker blue
      break;
    case 'snow':
      clearColor = new BABYLON.Color4(0.8, 0.8, 0.9, 1.0); // light gray
      break;
    case 'storm':
      clearColor = new BABYLON.Color4(0.2, 0.2, 0.3, 1.0); // dark gray
      break;
  }
  scene.clearColor = clearColor;

  // Use era to adjust ground color (example)
  let groundColor: BABYLON.Color3;
  switch (era) {
    case 'agrarian':
      groundColor = new BABYLON.Color3(0.3, 0.7, 0.3); // greenish
      break;
    case 'stone':
      groundColor = new BABYLON.Color3(0.5, 0.5, 0.5); // gray
      break;
    case 'modern':
      groundColor = new BABYLON.Color3(0.4, 0.4, 0.6); // bluish
      break;
  }

  // Camera
  const camera = new BABYLON.ArcRotateCamera('camera', Math.PI / 2, Math.PI / 3, 15, BABYLON.Vector3.Zero(), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 5;
  camera.upperRadiusLimit = 30;

  // Light
  const light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), scene);
  light.intensity = 0.7;

  // Ground
  const ground = BABYLON.MeshBuilder.CreateGround('ground', { width: 20, height: 20 }, scene);
  const groundMaterial = new BABYLON.StandardMaterial('groundMat', scene);
  groundMaterial.diffuseColor = groundColor;
  ground.material = groundMaterial;

  // Water
  const water = BABYLON.MeshBuilder.CreateBox('water', { width: 20, height: 1, depth: 5 }, scene);
  water.position = new BABYLON.Vector3(0, -0.5, 0);
  const waterMaterial = new BABYLON.StandardMaterial('waterMat', scene);
  // Water color can also change with weather (simplified)
  let waterColor: BABYLON.Color3;
  switch (weather) {
    case 'clear':
      waterColor = new BABYLON.Color3(0.2, 0.4, 0.8);
      break;
    case 'rain':
      waterColor = new BABYLON.Color3(0.1, 0.3, 0.6); // darker
      break;
    case 'snow':
      waterColor = new BABYLON.Color3(0.5, 0.5, 0.5); // grayish if frozen
      break;
    case 'storm':
      waterColor = new BABYLON.Color3(0.1, 0.2, 0.4); // very dark
      break;
  }
  waterMaterial.diffuseColor = waterColor;
  water.material = waterMaterial;

  // Simple hills (boxes)
  const hillPositions = [
    new BABYLON.Vector3(-8, 0, -8),
    new BABYLON.Vector3(8, 0, 8),
    new BABYLON.Vector3(-8, 0, 8),
    new BABYLON.Vector3(8, 0, -8),
  ];
  hillPositions.forEach((pos, index) => {
    const hill = BABYLON.MeshBuilder.CreateBox(`hill_${index}`, { width: 3, height: 2 + Math.random() * 2, depth: 3 }, scene);
    hill.position = pos;
    const hillMaterial = new BABYLON.StandardMaterial(`hillMat_${index}`, scene);
    // Hill color: greenish, but can be adjusted by era
    let hillColor = new BABYLON.Color3(0.2, 0.6, 0.2 + Math.random() * 0.2);
    switch (era) {
      case 'agrarian':
        hillColor = new BABYLON.Color3(0.2, 0.6, 0.2 + Math.random() * 0.2); // green
        break;
    case 'stone':
      hillColor = new BABYLON.Color3(0.4, 0.4, 0.4); // rocky gray
      break;
    case 'modern':
      hillColor = new BABYLON.Color3(0.3, 0.3, 0.5); // slightly bluish gray
      break;
  }
  hillMaterial.diffuseColor = hillColor;
  hill.material = hillMaterial;

  // Simple trees (trunk and foliage as boxes)
  const treePositions = [
    new BABYLON.Vector3(-5, 0, -5),
    new BABYLON.Vector3(5, 0, 5),
    new BABYLON.Vector3(-5, 0, 5),
    new BABYLON.Vector3(5, 0, -5),
  ];
  treePositions.forEach((pos, index) => {
    const trunk = BABYLON.MeshBuilder.CreateBox(`trunk_${index}`, { width: 0.5, height: 2, depth: 0.5 }, scene);
    trunk.position = pos.add(new BABYLON.Vector3(0, 1, 0));
    const trunkMaterial = new BABYLON.StandardMaterial(`trunkMat_${index}`, scene);
    trunkMaterial.diffuseColor = new BABYLON.Color3(0.4, 0.2, 0.1); // brown
    trunk.material = trunkMaterial;

    const foliage = BABYLON.MeshBuilder.CreateBox(`foliage_${index}`, { width: 2, height: 2, depth: 2 }, scene);
    foliage.position = pos.add(new BABYLON.Vector3(0, 3, 0));
    const foliageMaterial = new BABYLON.StandardMaterial(`foliageMat_${index}`, scene);
    // Foliage color can change by era
    let foliageColor = new BABYLON.Color3(0.1, 0.5, 0.1); // green
    switch (era) {
      case 'agrarian':
        foliageColor = new BABYLON.Color3(0.1, 0.5, 0.1); // green
        break;
    case 'stone':
      foliageColor = new BABYLON.Color3(0.2, 0.2, 0.2); // dull green/gray
      break;
    case 'modern':
      foliageColor = new BABYLON.Color3(0.1, 0.4, 0.1); // slightly bluish green
      break;
  }
  foliageMaterial.diffuseColor = foliageColor;
  foliage.material = foliageMaterial;

  // Village 1: buildings and road
  const village1Center = new BABYLON.Vector3(-6, 0, -6);
  const village1Buildings: { mesh: BABYLON.Mesh; originalColor: BABYLON.Color3 }[] = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (Math.random() > 0.3) { // sparse buildings
        const building = BABYLON.MeshBuilder.CreateBox(`v1_building_${i}_${j}`, { width: 0.8, height: 1 + Math.random() * 2, depth: 0.8 }, scene);
        building.position = village1Center.add(new BABYLON.Vector3(i * 1.5 - 3, 0.5 + (1 + Math.random() * 2) / 2, j * 1.5 - 3));
        const buildingMaterial = new BABYLON.StandardMaterial(`v1_buildingMat_${i}_${j}`, scene);
        // Building color by era
        let buildingColor = new BABYLON.Color3(0.6, 0.6, 0.6); // default gray
        switch (era) {
          case 'agrarian':
            buildingColor = new BABYLON.Color3(0.6, 0.5, 0.3); // earthy brown
            break;
          case 'stone':
            buildingColor = new BABYLON.Color3(0.5, 0.5, 0.5); // stone gray
            break;
          case 'modern':
            buildingColor = new BABYLON.Color3(0.4, 0.4, 0.7); // bluish modern
            break;
        }
        buildingMaterial.diffuseColor = buildingColor;
        building.material = buildingMaterial;
        village1Buildings.push({ mesh: building, originalColor: buildingMaterial.diffuseColor.clone() });
      }
    }
  }
  // Road for village 1
  const road1 = BABYLON.MeshBuilder.CreateBox('road1', { width: 8, height: 0.1, depth: 2 }, scene);
  road1.position = village1Center.add(new BABYLON.Vector3(0, 0.05, 0));
  road1.rotation = new BABYLON.Vector3(0, Math.PI / 4, 0);
  const roadMaterial = new BABYLON.StandardMaterial('roadMat', scene);
  // Road color can change by era
  let roadColor = new BABYLON.Color3(0.4, 0.4, 0.4);
  switch (era) {
    case 'agrarian':
      roadColor = new BABYLON.Color3(0.4, 0.3, 0.2); // dirt road
      break;
    case 'stone':
      roadColor = new BABYLON.Color3(0.5, 0.5, 0.5); // stone road
      break;
    case 'modern':
      roadColor = new BABYLON.Color3(0.2, 0.2, 0.2); // asphalt
      break;
  }
  roadMaterial.diffuseColor = roadColor;
  road1.material = roadMaterial;

  // Village 2: buildings and road
  const village2Center = new BABYLON.Vector3(6, 0, 6);
  const village2Buildings: { mesh: BABYLON.Mesh; originalColor: BABYLON.Color3 }[] = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (Math.random() > 0.3) {
        const building = BABYLON.MeshBuilder.CreateBox(`v2_building_${i}_${j}`, { width: 0.8, height: 1 + Math.random() * 2, depth: 0.8 }, scene);
        building.position = village2Center.add(new BABYLON.Vector3(i * 1.5 - 3, 0.5 + (1 + Math.random() * 2) / 2, j * 1.5 - 3));
        const buildingMaterial = new BABYLON.StandardMaterial(`v2_buildingMat_${i}_${j}`, scene);
        // Building color by era (same as village1 for simplicity)
        let buildingColor = new BABYLON.Color3(0.6, 0.6, 0.6); // default gray
        switch (era) {
          case 'agrarian':
            buildingColor = new BABYLON.Color3(0.6, 0.5, 0.3); // earthy brown
            break;
          case 'stone':
            buildingColor = new BABYLON.Color3(0.5, 0.5, 0.5); // stone gray
            break;
          case 'modern':
            buildingColor = new BABYLON.Color3(0.4, 0.4, 0.7); // bluish modern
            break;
        }
        buildingMaterial.diffuseColor = buildingColor;
        building.material = buildingMaterial;
        village2Buildings.push({ mesh: building, originalColor: buildingMaterial.diffuseColor.clone() });
      }
    }
  }
  // Road for village 2
  const road2 = BABYLON.MeshBuilder.CreateBox('road2', { width: 8, height: 0.1, depth: 2 }, scene);
  road2.position = village2Center.add(new BABYLON.Vector3(0, 0.05, 0));
  road2.rotation = new BABYLON.Vector3(0, -Math.PI / 4, 0);
  road2.material = roadMaterial; // same road material as village1

  // Create 24 residents (boxes) and assign them to villages
type ResidentState = 'labor' | 'rest' | 'social';

type Resident = {
    id: string;
    mesh: BABYLON.Mesh;
    originalPosition: BABYLON.Vector3;
    originalColor: BABYLON.Color3;
    village: 'village1' | 'village2';
    targetIndex: number;
    waypoints: BABYLON.Vector3[];
    speed: number;
    isWalking: boolean;
    state: ResidentState;
    stateTimer: number;
    socialPartner: string | null;
};

const residents: Resident[] = [];
   // Waypoint sets for each village and activity type
   const village1LaborWaypoints = [
     new BABYLON.Vector3(-8, 0, -8),
     new BABYLON.Vector3(-6, 0, -6),
     new BABYLON.Vector3(-4, 0, -4),
     new BABYLON.Vector3(-2, 0, -2),
     new BABYLON.Vector3(0, 0, 0),
   ];
   const village1RestWaypoints = [
     new BABYLON.Vector3(-10, 0, -10),
     new BABYLON.Vector3(-12, 0, -8),
     new BABYLON.Vector3(-8, 0, -12),
     new BABYLON.Vector3(-6, 0, -10),
   ];
   const village1SocialWaypoints = [
     new BABYLON.Vector3(-4, 0, -8),
     new BABYLON.Vector3(-8, 0, -4),
     new BABYLON.Vector3(-6, 0, -6),
     new BABYLON.Vector3(-2, 0, -10),
   ];
   
   const village2LaborWaypoints = [
     new BABYLON.Vector3(8, 0, 8),
     new BABYLON.Vector3(6, 0, 6),
     new BABYLON.Vector3(4, 0, 4),
     new BABYLON.Vector3(2, 0, 2),
     new BABYLON.Vector3(0, 0, 0),
   ];
   const village2RestWaypoints = [
     new BABYLON.Vector3(10, 0, 10),
     new BABYLON.Vector3(12, 0, 8),
     new BABYLON.Vector3(8, 0, 12),
     new BABYLON.Vector3(6, 0, 10),
   ];
   const village2SocialWaypoints = [
     new BABYLON.Vector3(4, 0, 8),
     new BABYLON.Vector3(8, 0, 4),
     new BABYLON.Vector3(6, 0, 6),
     new BABYLON.Vector3(2, 0, 10),
   ];

for (let i = 0; i < 24; i++) {
     const resident = BABYLON.MeshBuilder.CreateBox(`resident_${i}`, { width: 0.4, height: 0.8, depth: 0.4 }, scene);
     // Place resident slightly above ground
     const originalPosition = new BABYLON.Vector3(
       (Math.random() - 0.5) * 10,
       0.4,
       (Math.random() - 0.5) * 10
     );
     resident.position = originalPosition;
     const residentMaterial = new BABYLON.StandardMaterial(`residentMat_${i}`, scene);
     // Assign color based on village
     let residentColor = new BABYLON.Color3(0.8, 0.6, 0.4); // default brownish
     let village: 'village1' | 'village2';
     let waypoints: BABYLON.Vector3[];
     
     // Determine village and assign initial state
     if (i < 12) {
       // Village 1
       village = 'village1';
       residentColor = new BABYLON.Color3(0.8, 0.6, 0.4); // brown
       
       // Randomly assign initial state
       const stateRand = Math.random();
       if (stateRand < 0.4) {
         waypoints = village1LaborWaypoints;
       } else if (stateRand < 0.7) {
         waypoints = village1RestWaypoints;
       } else {
         waypoints = village1SocialWaypoints;
       }
     } else {
       // Village 2
       village = 'village2';
       residentColor = new BABYLON.Color3(0.6, 0.6, 0.4); // slightly different brown
       
       // Randomly assign initial state
       const stateRand = Math.random();
       if (stateRand < 0.4) {
         waypoints = village2LaborWaypoints;
       } else if (stateRand < 0.7) {
         waypoints = village2RestWaypoints;
       } else {
         waypoints = village2SocialWaypoints;
       }
     }
     
     residents.push({
       id: `resident_${i}`,
       mesh: resident,
       originalPosition,
       originalColor: residentColor,
       village: village,
       targetIndex: 0,
       waypoints: waypoints,
       speed: 0.5 + Math.random() * 0.5,
       isWalking: false,
       state: village === 'village1' ? 
         (i < 4 ? 'labor' : (i < 8 ? 'rest' : 'social')) : 
         (i < 16 ? 'labor' : (i < 20 ? 'rest' : 'social')),
       stateTimer: 0,
       socialPartner: null
     });
     resident.material = residentMaterial;
   }

// Updated animation loop for residents with state transitions and social interaction
   scene.onBeforeRenderObservable.add(() => {
     // First, detect social interactions (residents close to each other)
     residents.forEach(res => {
       // Reset social partner if not already set through interaction
       if (res.state === 'social' && res.socialPartner === null) {
         // Look for nearby residents to interact with
         const interactionRadius = 1.5;
         for (const other of residents) {
           if (other.id !== res.id && 
               other.village === res.village && 
               other.state === 'social') {
             const distance = res.mesh.position.distanceTo(other.mesh.position);
             if (distance < interactionRadius) {
               // Set mutual social partnership
               res.socialPartner = other.id;
               other.socialPartner = res.id;
               break;
             }
           }
         }
       }
     });

     // Update each resident
     residents.forEach(res => {
       // Update state timer
       res.stateTimer += engine.getDeltaTime() / 1000; // Convert to seconds
       
       // Change state after certain time (every 10-15 seconds)
       if (res.stateTimer > (10 + Math.random() * 5)) {
         res.stateTimer = 0;
         
         // Determine new state based on current state and village
         let newState: ResidentState = res.state;
         const stateRand = Math.random();
         
         if (res.village === 'village1') {
           if (stateRand < 0.3) newState = 'labor';
           else if (stateRand < 0.6) newState = 'rest';
           else newState = 'social';
         } else {
           // Village 2
           if (stateRand < 0.3) newState = 'labor';
           else if (stateRand < 0.6) newState = 'rest';
           else newState = 'social';
         }
         
         // Only change state if it's different
         if (newState !== res.state) {
           res.state = newState;
           
           // Assign new waypoints based on new state
           switch (newState) {
             case 'labor':
               res.waypoints = res.village === 'village1' ? village1LaborWaypoints : village2LaborWaypoints;
               break;
             case 'rest':
               res.waypoints = res.village === 'village1' ? village1RestWaypoints : village2RestWaypoints;
               break;
             case 'social':
               res.waypoints = res.village === 'village1' ? village1SocialWaypoints : village2SocialWaypoints;
               break;
           }
           
           // Reset target index when changing waypoints
           res.targetIndex = 0;
         }
       }

       // Handle movement
       if (!res.isWalking) {
         // Pick a new target
         res.targetIndex = Math.floor(Math.random() * res.waypoints.length);
         res.isWalking = true;
       }

       const target = res.waypoints[res.targetIndex];
       const direction = target.subtract(res.mesh.position);
       const distance = direction.length();

       if (distance < 0.1) {
         // Arrived at target
         res.isWalking = false;
         // Optionally, we could play an idle animation here
         return;
       }

       // Normalize direction and move
       direction.normalize();
       const movement = direction.scale(res.speed * engine.getDeltaTime() / 1000);
       res.mesh.position.addInPlace(movement);

       // Rotate to face direction of movement
       if (direction.length() > 0) {
         const yaw = Math.atan2(direction.x, direction.z);
         res.mesh.rotationQuaternion = null; // Ensure we use Euler angles
         res.mesh.rotation = new BABYLON.Vector3(0, yaw, 0);
       }
       
       // Change color based on state for visual feedback
       if (res.state === 'labor') {
         // Labor: brighter color
         const baseColor = res.village === 'village1' 
           ? new BABYLON.Color3(0.9, 0.7, 0.5) 
           : new BABYLON.Color3(0.7, 0.7, 0.5);
         res.material.diffuseColor = baseColor;
       } else if (res.state === 'rest') {
         // Rest: darker color
         const baseColor = res.village === 'village1' 
           ? new BABYLON.Color3(0.6, 0.4, 0.3) 
           : new BABYLON.Color3(0.4, 0.4, 0.3);
         res.material.diffuseColor = baseColor;
       } else if (res.state === 'social') {
         // Social: pulse between colors when partnered
         if (res.socialPartner !== null) {
           // Pulse effect
           const pulse = Math.sin(Date.now() * 0.005) * 0.2 + 0.8;
           const baseColor = res.village === 'village1' 
             ? new BABYLON.Color3(0.8, 0.6, 0.4) 
             : new BABYLON.Color3(0.6, 0.6, 0.4);
           res.material.diffuseColor = baseColor.scale(pulse);
         } else {
           // No partner yet, use standard social color
           const baseColor = res.village === 'village1' 
             ? new BABYLON.Color3(0.8, 0.6, 0.4) 
             : new BABYLON.Color3(0.6, 0.6, 0.4);
           res.material.diffuseColor = baseColor;
         }
       }
     });
   });

  // Picking for resident selection
  scene.onPointerObservable.add((pointerInfo: BABYLON.PointerInfo) => {
    if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERPICK) {
      const pickInfo = pointerInfo.pickInfo;
      if (pickInfo && pickInfo.hit && pickInfo.pickedMesh) {
        const hitMesh = pickInfo.pickedMesh;
        // Check if the mesh is a resident
        const resident = residents.find(r => r.mesh.id === hitMesh.id);
        if (resident) {
          // Call the callback with the resident id
          onResidentSelect(resident.id);
        } else {
          // Clicked on something else, clear selection
          onResidentSelect(null);
        }
      } else {
        // Clicked on nothing, clear selection
        onResidentSelect(null);
      }
    }
  });

  // These variables are used in later stages, but for G1 we just reference them to avoid unused warnings.

  return scene;
};
