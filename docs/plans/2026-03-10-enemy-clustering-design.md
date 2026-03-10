# Enemy Clustering System Design

## Overview
Replace constant enemy swarming with clustered spawn points and scout enemies.

## Features

### Clumps
- Mixed sizes: small packs (3-5) early game, larger hordes (6-10) near goal
- Hybrid spawning: fixed ambush points + random clumps ahead
- Dormant until player enters lure range (~40 units)
- Once alerted, enemies chase normally

### Scouts  
- New enemy type that roams randomly
- On player detection: fires flare → alerts nearest dormant clump
- After flare: joins chase like normal enemy

## State Changes

```js
// New state arrays
state.clumps = [{ 
  id, z, x, 
  enemies: [], // enemy objects within this clump
  alerted: false,
  size: 'small' | 'large'
}]

state.scouts = [{
  id, x, z,
  nearestClumpId: null, // which clump they'll alert
  hasFired: false
}]

// Enemy modification
enemy.dormant = true | false
```

## Events
- `{ type: 'flare', scoutId, clumpId, x, z }` — for visual/audio

## Constants
- `LURE_DISTANCE = 40`
- `SCOUT_DETECTION_RANGE = 35`
- `AMBUSH_POINTS = [100, 200, 350]` (Z positions)
