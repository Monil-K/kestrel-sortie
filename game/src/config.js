// Kestrel Sortie — shared tuning. Metres, seconds, radians unless a name says otherwise.

export const WORLD_SEED = 20261126;

export const WORLD = {
  extent: 9000,          // terrain is built over extent x extent metres, centred on origin
  grid: 200,             // terrain cells per side (low-poly, flat shaded)
  seaLevel: 0,
  fogNear: 1400,
  fogFar: 8200,
};

export const RUNWAY = {
  x: 0,
  z: 0,
  elevation: 16,         // metres above sea level
  length: 1520,
  width: 42,
  heading: 0,            // degrees true, runway axis along -Z (north)
};

export const AIRPORT = {
  tower: { x: 96, z: -170 },
  hangars: [
    { x: 92, z: 40, rot: 0 },
    { x: 92, z: 150, rot: 0 },
  ],
  fuelFarm: { x: 140, z: -60 },
};

// Aircraft: a single-engine turboprop light strike aircraft, 3.4 t, straight wing.
export const AC = {
  mass: 3400,
  wingArea: 18.2,
  span: 9.6,
  length: 10.9,
  cl0: 0.16,
  clAlpha: 5.1,          // per radian
  alphaStall: 0.30,      // ~17 degrees
  clMax: 1.42,
  cd0: 0.031,
  inducedK: 0.048,
  sideForce: 0.42,
  thrustMax: 15500,      // newtons at sea level, static
  propEfficiency: 0.78,
  vne: 168,              // m/s never-exceed (326 kt)
  gearDrag: 0.028,
  flapDrag: 0.022,
  ratePitch: 0.66,       // rad/s at reference dynamic pressure
  rateRoll: 1.9,
  rateYaw: 0.42,
  refQ: 3200,            // Pa, dynamic pressure where surfaces are fully effective
  gearHeight: 2.35,
  fuelBurn: 0.00052,     // fraction of a full tank per second at full throttle
  tankSeconds: 2100,
};

export const START = {
  onRunway: { x: RUNWAY.x, y: RUNWAY.elevation + AC.gearHeight, z: RUNWAY.z + RUNWAY.length / 2 - 60, heading: 0 },
  airborne: { x: -900, y: 520, z: 1500, heading: 32 },
};

export const MISSIONS = [
  {
    id: 'ridge',
    num: '01',
    name: 'Ridge Run',
    blurb: 'Thread twelve gates down the volcano valley. The clock is the enemy, the ridgeline is the penalty.',
    time: 210,
  },
  {
    id: 'patrol',
    num: '02',
    name: 'Coast Patrol',
    blurb: 'Rake the depot at the north cape with the cannon, then bring the bird home in one piece.',
    time: 420,
  },
  {
    id: 'approach',
    num: '03',
    name: 'Short Final',
    blurb: 'Join the pattern and land it: centreline, sink rate, touchdown zone. A greaser is worth more than speed.',
    time: 300,
  },
  {
    id: 'free',
    num: '04',
    name: 'Free Flight',
    blurb: 'No clock, no score. Just the island, the light and a full tank of fuel.',
    time: 0,
  },
];

export const COLORS = {
  hud: '#93ffe0',
  hudDim: 'rgba(147,255,224,0.42)',
  warn: '#ff5f4d',
  amber: '#ffbe5c',
  sky: 0x8ec6d8,
};
