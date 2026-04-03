# Gauntlet Level - 10 Acceptance Tests

These tests verify the 3D implementation matches the level map. Each test is pass/fail.

## Tests

1. **River Ford (z=0-60)**: Water visual exists at start, jeep movement is affected by current (pushed sideways), shallow ford crossing point exists
2. **Boulder Slalom (z=60-130)**: At least 8 boulders with physics colliders, jeep collides and bounces off them, they form a slalom pattern requiring weaving
3. **Mud Swamp (z=130-180)**: Brown/dark terrain patch visible, jeep speed reduced to ~50% when driving through it, visual distinction from normal ground
4. **Pitch Black Tunnel (z=200-280)**: Scene goes dark/black inside tunnel zone, headlight effect illuminates small area ahead, hidden boulders inside tunnel have colliders
5. **Pendulum Alley (z=290-350)**: 4 pendulum objects visually swinging back and forth, collision with pendulum damages/pushes jeep, timing gaps exist between swings to pass safely
6. **Crumbling Bridge (z=360-390)**: Bridge visual over a gap/chasm, missing plank sections visible, jeep can fall through gaps if not aligned
7. **Lava Field (z=400-440)**: Multiple lava pool visuals with glow effect, narrow safe path between pools, proximity to lava triggers Gunther quotes
8. **Ice Patch (z=450-490)**: Icy/blue terrain visible, jeep has reduced/zero traction (slides), steering is dramatically different on ice
9. **Falling Rocks (z=500-540)**: Canyon walls visible on sides, rocks periodically fall from above, rocks have collision (can hit/block jeep)
10. **Full Playthrough**: Game loads without JS errors, can drive from START to GOAL through all 10 sections, win condition triggers at goal

## Scoring
Each test: PASS = 10%, FAIL = 0%
Target: 95% (9.5/10 passing) before notifying TurboSloth
