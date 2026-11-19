# Model brief — the toy hospital

Three kits are built in parallel against this brief. The world layout, the camera, the UI and the two play modes come
afterwards on top of them. **All text anywhere in the simulation is English.**

## What this is

A medium-sized Thai public hospital rebuilt as a bright isometric toy simulator, one offline HTML page.
The reference look is the simulator skill's own airport/plant kit, which already worked:
`C:\Users\Thanunchai\.claude\skills\simulator\sims\airport-shared\` — read `gse.js` and `airside.js` for the idiom
before writing anything. Toy proportions with a premium finish: chunky bevelled forms, matte paint with a soft sheen,
crisp dark trim, few colours, every object recognisable from its silhouette at thumbnail size.
Cheap = flat boxes, sharp corners, noisy detail, plastic shine.

## The shared look

`sim/shared/style.js` holds the palette (`HOS`), the materials (`hosMat`), cached geometry (`rbox`, `rcyl`, `rsph`),
`mesh`, `box`, `labelTexture`, `signPanel` and the stage (`createHospitalStage`). Use it. Do not declare colours in
your own file — if the palette lacks one, add it to `style.js` and say so in your report.

`sim/shared/stage.js`, `select.js` and `thumbs.js` are copied unchanged from the airport kit. Do not edit them.

## Scale contract

Real metres, y up, origin of every model on the floor at its own centre, front face toward **+z** unless stated.
All three kits must meet each other at these numbers:

| | y |
|---|---|
| Floor-to-floor | 4.2 (slab 0.3, so a room's inner height is 3.9) |
| Full-height wall | 2.9 (rooms are open-topped: no ceilings, the camera looks in from above) |
| Cubicle wall | solid to 1.25, frosted glass 1.25 → 2.45 |
| Doorway opening | 1.6 wide, 2.15 high, no door leaf |
| Corridor | 3.2 wide |
| Counter top | 1.05, depth 0.70 |
| Desk top | 0.75, 1.4 × 0.7 |
| Chair seat | 0.45 |
| Exam bed deck | 0.62 (2.0 × 0.80) |
| Ward / ER / ICU bed deck | 0.62 (2.05 × 0.95 incl. rails) |
| Stretcher deck | 0.75 |
| Wheelchair seat | 0.48 |
| Trolley / cart deck | 0.90 |
| Lab bench top | 0.90, depth 0.70 |
| X-ray table deck | 0.70 |
| CT bore centre | 1.15, gantry outer Ø 2.3, gantry 0.9 thick |
| OR table deck | 0.85 |
| OR lamp dome | hangs at 2.3, Ø 0.8 |
| IV pole | 1.95 tall, bag hook at 1.80 |
| Shelf unit | 2.05 tall, 0.50 deep |
| Wall monitor / queue screen | screen centre 2.05 |
| Standing person | 1.70 (head top), eye 1.58, shoulder 1.42, hip 0.92 |
| Seated person | hip at 0.45, head top 1.22 |

A patient lying on a bed has their back at deck + 0.10. A person at a counter stands 0.55 clear of its front face.

## Agent A — `sim/shared/rooms.js`: the building

Parameterised builders, never fixed positions (the world file places them). Each returns `{group, ...}` with its key
points and any moving parts.

```
buildFloorPlate({w, d, tint})             -> {group}                 tiled slab + edge trim, 1 m tile grid
buildRoomShell({w, d, name, color, doors, glassTop, tint})
                                          -> {group, doorPts}        4 walls with doorway openings, wall sign, floor tint
buildWallRun({len, h, openings})          -> {group}                 one wall with openings [{at, w}]
buildGlassPartition({len, solidH, glassH})-> {group}
buildCubicleRow({n, w, d})                -> {group, cells:[{x,z}]}  exam cubicles off a corridor, frosted upper halves
buildCorridor({len, w, dir, stripes})     -> {group}                 corridor floor + coloured wayfinding stripes
buildCounter({len, posts, color})         -> {group, posts:[{x,z}]}  counter, computers, staff chairs behind, queue screen over
buildWaitingBay({w, d, rows, perRow})     -> {group, seats:[{x,z,rot}]}  linked chairs + a queue display
buildLiftCore({pax, bed})                 -> {group, doors:[{x,z,rot}]}  lift lobby, pax + stretcher lifts, stair flight
buildEntrance({w, color})                 -> {group}                 sliding doors, canopy, bollards
buildAmbulanceBay({w})                    -> {group, ambulance}      ER canopy + a toy ambulance (returns its group)
buildWardBay({beds, w, d})                -> {group, bedPts:[{x,z}]} open ward bay: bed positions, nurse station, curtains
buildNurseStation({len})                  -> {group}
buildSignGantry({items})                  -> {group}                 hanging department signs over a corridor
buildStairBlock(), buildToilet({w,d}), buildStoreRoom({w,d})
buildCarPark({cols, rows})                -> {group}                 bays + a few toy cars
buildTree(), buildHedge({len}), buildFence({len}), buildCityBlock({w,d,h})
```

Room list the world will ask for (so the builders must cover these sizes): Info 6×4, Records 11×7, Triage 9×6,
Billing 9×6, Pharmacy 11×7, Lab 11×7, X-ray 8×6 ×2, CT 9×7, EKG 6×5, ER triage 5×4, ER 15×9, Procedure 8×6,
Dental 9×7, Physiotherapy 13×9, Pre-op 7×5, OR 7×6 ×6, PACU 12×8, Admission 7×5, ICU 15×10, Ward bay 20×9 ×8,
exam cubicles 3.4×3.6 (19 of them in rows).

## Agent B — `sim/shared/equip.js`: medical equipment

Each builder returns `{group, ...}` plus named moving parts as setters. Equipment is what sells the rooms, so build
it properly: panel lines, dark screens, cable loops, castors, printed labels where a real machine carries one.

```
Front office   buildRegDesk, buildCashierCounter({cardReader}), buildFileShelf({bays}), buildPrinter,
               buildQueueKiosk, buildWaitingChairRow({n}), buildWaterCooler, buildSanitiser, buildBin({kind})
Clinic         buildExamBed({head}), buildExamDesk, buildDoctorChair, buildPatientStool, buildCurtain({len, open}),
               buildBPMonitor, buildWeighScale({heightRod}), buildThermometerStand, buildWallChart, buildOtoscopeSet
Lab            buildLabBench({len}), buildAnalyser({lights}), buildCentrifuge({spin}), buildMicroscope,
               buildPhlebotomyChair, buildSpecimenHatch, buildTubeRack, buildFridge
Imaging        buildXrayTable({tube}), buildXrayBooth, buildCTScanner({bed, ring}), buildUltrasound, buildEKGCart,
               buildLeadApronRack, buildViewingStation({screens})
Pharmacy       buildPharmShelf({bays}), buildDispenseCounter({windows}), buildPackingTable, buildPillTrolley
Emergency      buildERBed({rails, head}), buildVitalMonitor({on, beat}), buildIVPole({bags}), buildCrashCart,
               buildDefibrillator, buildVentilator, buildOxygenPanel, buildSuctionUnit
Surgery        buildORTable({tilt}), buildORLamp({aim}), buildAnaesthesiaMachine, buildInstrumentTable,
               buildScrubSink({taps}), buildSurgicalScreen, buildElectrosurgery, buildPACUBed, buildICUBed
Ward           buildWardBed({head}), buildBedsideCabinet, buildOverbedTable, buildInfusionPump, buildChartBoard
Dental         buildDentalChair({light, tray}), buildDentalXray, buildSteriliser
Physio         buildPTTable, buildParallelBars, buildExerciseBike, buildTreadmill, buildUltrasoundTherapy, buildMatSet
Transport      buildWheelchair({roll, occupied}), buildStretcher({roll}), buildPorterTrolley, buildLinenCart
```

`buildVitalMonitor({on, beat})` draws its trace on a canvas texture — the trace is a pure function of the `beat`
argument, never of `Date.now()`.

## Agent C — `sim/shared/people.js`: the people

Two things: posable figures for staff and the followed patient, and an instanced crowd for everyone else.

```
buildPerson({role, skin, hair, shirt, scale}) -> {group, pose(kind, k, phase), parts:{head, torso, armL, armR, legL, legR}}
   role: 'doctor' | 'nurse' | 'tech' | 'admin' | 'pharm' | 'porter' | 'surgeon' | 'patient' | 'gown' | 'child' | 'elder'
   pose kinds: 'stand' | 'walk' (phase 0..1 drives the cycle) | 'sit' | 'lie' | 'lean' (examining)
             | 'type' (at a desk) | 'push' (wheelchair or stretcher) | 'scrub' (arms up, surgeon)
   A doctor gets a white coat over scrubs and a stethoscope; a nurse mint scrubs; a surgeon cap, mask and gown;
   a porter a darker uniform; 'gown' is an inpatient in a gown; 'child' is 1.20 tall, 'elder' slightly stooped with a cane.

createCrowd(max) -> {group, set(i, {x, y, z, rot, color, pose}), count(n), update()}
   InstancedMesh body + head + a flat shadow disc, per-instance colour, one draw call each. Poses the crowd needs:
   0 standing, 1 walking (a small bob from the instance's own phase), 2 sitting, 3 lying.
   Several hundred instances must cost no more than a few draw calls.
```

A posable person is about 12 primitives: head, hair, torso, two arms (upper + fore), two legs (thigh + shin), shoes.
Round every form. No faces beyond a hint of hair and, where the role calls for it, a mask.

## How to work

1. Read `sim/shared/style.js`, `sim/shared/stage.js`, and the airport kit's `gse.js` for the idiom.
2. Build your bench page at `sim/bench-<yours>/main.js`: every model on the ground under
   `createHospitalStage`, laid out in rows with its name under it. Copy the camera framing idea from
   `C:\Users\Thanunchai\.claude\skills\simulator\sims\airport-look\`.
   Export `window.SIM = {ready: true, duration: 10, render: (t) => {...}}` so the capture script can drive it.
3. Build and capture:
   ```
   cd "C:/Users/Thanunchai/Desktop/Data/Claude Code/3DSimulation_HospitalSystem2"
   node "C:/Users/Thanunchai/.claude/skills/simulator/sims/build.mjs" ./sim/bench-<yours>
   node "C:/Users/Thanunchai/.claude/skills/simulator/sims/capture.mjs" bench-<yours> --still 2 --size 1600x900 --out bench.png
   ```
   Then **look at the PNG** with the Read tool and fix what is wrong. Iterate until it reads as one world.
4. Close-up stills of the hard models plus one whole-bench still.

## Rules

- Touch only your own file and your own bench folder. `style.js` is shared: append to the palette if you must, never
  reorganise it.
- No downloads, no new packages. Everything is the three.js already in the kit's `node_modules`.
- Merge static parts per material and instance repeated parts. A ward bay with 25 beds, an OR with its full kit, and
  a crowd of 300 all have to render at 45 fps on Intel integrated graphics.
- Every animated value is an argument, never read from a clock inside the model. `render(t)` elsewhere must stay a
  pure function of time.
- All text in the models (signs, numbers, labels) is English.
- Report in under 25 lines: what you built, the exported API exactly as callers must use it, the still paths, and
  anything in `style.js` you would change and why.
