// Agent B's bench: every builder in sim/shared/equip.js on the ground, in department rows, each one labelled,
// with everything that moves driven from t alone (render(t) stays a pure function of time).
//
//   node "C:/Users/Thanunchai/.claude/skills/simulator/sims/build.mjs" ./sim/bench-equip
//   node "C:/Users/Thanunchai/.claude/skills/simulator/sims/capture.mjs" bench-equip --still 2 --size 1600x900 --out bench-equip.png
//
// A close-up: ?shot=ct live, or --config shot.json with {"shot": "ct"} when capturing.
// Shots: all, front, clinic, lab, ct, imaging, pharmacy, er, or, ward, dental, physio, transport.
import * as THREE from 'three';
import {runSim} from 'simulator-kit/runtime.js';
import {createHospitalStage, HOS, hosMat, labelTexture} from '../shared/style.js';
import * as E from '../shared/equip.js';

const D2R = Math.PI / 180;

runSim(
  {duration: 10, fps: 30, theme: 'light', shot: 'all', hud: {enabled: false, title: 'equip bench', subtitle: ''}, director: {enabled: false}, watermark: ''},
  async ({canvas, capture, cfg}) => {
    const SHOT = new URLSearchParams(location.search).get('shot') || cfg.shot || 'all';
    const st = createHospitalStage(canvas, {fov: 28});
    const root = new THREE.Group();
    st.scene.add(root);

    // ---- the ground and the label helper
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260).rotateX(-Math.PI / 2), hosMat(HOS.floorA, {rough: 0.9}));
    ground.receiveShadow = true;
    root.add(ground);
    const grid = new THREE.GridHelper(240, 240, HOS.floorB, HOS.floorB);
    grid.position.y = 0.004;
    grid.material.opacity = 0.55;
    grid.material.transparent = true;
    root.add(grid);

    const POS = {};
    function label(text, x, z) {
      const tex = labelTexture(text, {color: HOS.inkSoft, w: 1024, h: 150, font: '700 66px Inter, system-ui, sans-serif'});
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 0.4), new THREE.MeshBasicMaterial({map: tex, transparent: true}));
      m.rotation.x = -Math.PI / 2;
      m.position.set(x, 0.012, z);
      root.add(m);
    }
    /** a wall slice behind a wall-mounted model so it reads the way it will in a room */
    function wall(x, z, w = 2.0) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(w, 2.9, 0.12), hosMat(HOS.wall, {rough: 0.65}));
      g.position.set(x, 1.45, z - 0.07);
      g.castShadow = g.receiveShadow = true;
      root.add(g);
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.16), hosMat(HOS.wallBase, {rough: 0.7}));
      base.position.set(x, 0.06, z - 0.05);
      base.receiveShadow = true;
      root.add(base);
    }

    // ---- the layout: each row is a department, each item gets a slot and a label
    // two columns of department rows, so the whole bench frames roughly 16:9 instead of one long diagonal
    const COLX = [-14, 14];
    const colZ = [0, 0];
    let col = 0;
    const rows = [];
    function row(name, front, items) {
      const total = items.reduce((s, it) => s + it[2], 0);
      const rowZ = colZ[col];
      let x = COLX[col] - total / 2;
      const placed = {};
      for (const [key, obj, w, opt = {}] of items) {
        const cx = x + w / 2;
        x += w;
        if (obj) {
          obj.group.position.set(cx + (opt.dx || 0), 0, rowZ + (opt.dz || 0));
          if (opt.ry) obj.group.rotation.y = opt.ry;
          root.add(obj.group);
        }
        if (opt.wall) wall(cx, rowZ - (opt.wallAt ?? 0.0), Math.max(1.6, w - 0.1));
        label(key, cx, rowZ + front);
        POS[key] = {x: cx, z: rowZ};
        placed[key] = {x: cx, z: rowZ};
      }
      rows.push({name, z: rowZ, w: total, front});
      colZ[col] += 5.8;
      return placed;
    }

    // front office
    const regDesk = E.buildRegDesk({len: 3.0});
    const cashier = E.buildCashierCounter({len: 2.4});
    const fileShelf = E.buildFileShelf({bays: 3});
    const printer = E.buildPrinter();
    const kiosk = E.buildQueueKiosk();
    const chairRow = E.buildWaitingChairRow({n: 4});
    const cooler = E.buildWaterCooler();
    const sanit = E.buildSanitiser();
    const bins = [E.buildBin({kind: 'general'}), E.buildBin({kind: 'clinical'}), E.buildBin({kind: 'sharps'})];
    bins[1].group.position.set(0.5, 0, 0.1);
    bins[2].group.position.set(1.0, 0, 0.2);
    bins[0].group.add(bins[1].group, bins[2].group);
    row('front', 1.9, [
      ['buildRegDesk', regDesk, 3.8],
      ['buildCashierCounter', cashier, 3.2],
      ['buildFileShelf', fileShelf, 3.4, {wall: true, wallAt: 0.33}],
      ['buildPrinter', printer, 1.6],
      ['buildQueueKiosk', kiosk, 1.8],
      ['buildWaitingChairRow', chairRow, 3.0],
      ['buildWaterCooler', cooler, 1.5],
      ['buildSanitiser', sanit, 1.5],
      ['buildBin', bins[0], 2.2],
    ]);

    // clinic
    const examBed = E.buildExamBed({head: 0.2});
    const examDesk = E.buildExamDesk();
    const docChair = E.buildDoctorChair();
    const stool = E.buildPatientStool();
    const curtain = E.buildCurtain({len: 2.6, open: 0.3});
    const bp = E.buildBPMonitor();
    const scale = E.buildWeighScale({heightRod: true});
    const thermo = E.buildThermometerStand();
    const wallChart = E.buildWallChart({});
    const otoscope = E.buildOtoscopeSet();
    row('clinic', 1.6, [
      ['buildExamBed', examBed, 2.2],
      ['buildExamDesk', examDesk, 2.2],
      ['buildDoctorChair', docChair, 1.5],
      ['buildPatientStool', stool, 1.3],
      ['buildCurtain', curtain, 3.2],
      ['buildBPMonitor', bp, 1.6],
      ['buildWeighScale', scale, 1.6],
      ['buildThermometerStand', thermo, 1.6],
      ['buildWallChart', wallChart, 2.0, {wall: true, wallAt: 0.06}],
      ['buildOtoscopeSet', otoscope, 1.8, {wall: true, wallAt: 0.06}],
    ]);

    // lab — the benchtop models sit on the bench, which is where callers put them
    const labBench = E.buildLabBench({len: 3.4});
    const centri = E.buildCentrifuge({});
    const micro = E.buildMicroscope();
    const tubes = E.buildTubeRack();
    const analyser = E.buildAnalyser({lights: 0});
    const phleb = E.buildPhlebotomyChair();
    const hatch = E.buildSpecimenHatch({});
    const fridge = E.buildFridge({door: 0.2});
    const lab = row('lab', 1.7, [
      ['buildLabBench', labBench, 4.0],
      ['buildCentrifuge', centri, 1.3],
      ['buildMicroscope', micro, 1.3],
      ['buildTubeRack', tubes, 1.3],
      ['buildAnalyser', analyser, 1.9],
      ['buildPhlebotomyChair', phleb, 1.8],
      ['buildSpecimenHatch', hatch, 2.2, {wall: true, wallAt: 0.02}],
      ['buildFridge', fridge, 1.7],
    ]);
    // lift the three benchtop models onto the bench top (0.90) in front of the bench
    for (const [k, o] of [['buildCentrifuge', centri], ['buildMicroscope', micro], ['buildTubeRack', tubes]]) {
      o.group.position.set(lab[k].x, 0.9, lab.buildLabBench.z);
    }
    labBench.group.position.x = lab.buildLabBench.x + 1.3; // slide the bench under them

    // imaging
    const xray = E.buildXrayTable({tube: 0});
    const booth = E.buildXrayBooth();
    const ct = E.buildCTScanner({bed: 0.2, ring: 0});
    const us = E.buildUltrasound();
    const ekg = E.buildEKGCart();
    const aprons = E.buildLeadApronRack();
    const viewst = E.buildViewingStation({screens: 2});
    row('imaging', 2.6, [
      ['buildXrayTable', xray, 4.0],
      ['buildXrayBooth', booth, 2.8],
      ['buildCTScanner', ct, 4.4],
      ['buildUltrasound', us, 1.9],
      ['buildEKGCart', ekg, 1.7],
      ['buildLeadApronRack', aprons, 1.8],
      ['buildViewingStation', viewst, 2.6],
    ]);

    // pharmacy
    const pshelf = E.buildPharmShelf({bays: 3});
    const dispense = E.buildDispenseCounter({windows: 2});
    const packing = E.buildPackingTable();
    const pillTrolley = E.buildPillTrolley();
    row('pharmacy', 1.9, [
      ['buildPharmShelf', pshelf, 3.4, {wall: true, wallAt: 0.33}],
      ['buildDispenseCounter', dispense, 3.8],
      ['buildPackingTable', packing, 2.4],
      ['buildPillTrolley', pillTrolley, 1.7],
    ]);

    // ---- the second column
    col = 1;

    // emergency
    const erBed = E.buildERBed({rails: 1, head: 0.3});
    const vitals = E.buildVitalMonitor({on: true, beat: 0});
    const iv = E.buildIVPole({bags: 2});
    const crash = E.buildCrashCart();
    const defib = E.buildDefibrillator({});
    const vent = E.buildVentilator({});
    const o2 = E.buildOxygenPanel();
    const suction = E.buildSuctionUnit({level: 0.35});
    row('er', 2.4, [
      ['buildERBed', erBed, 2.2],
      ['buildVitalMonitor', vitals, 1.7],
      ['buildIVPole', iv, 1.6],
      ['buildCrashCart', crash, 1.8],
      ['buildDefibrillator', defib, 1.7],
      ['buildVentilator', vent, 1.8],
      ['buildOxygenPanel', o2, 2.4, {wall: true, wallAt: 0.04}],
      ['buildSuctionUnit', suction, 1.8, {wall: true, wallAt: 0.04}],
    ]);

    // surgery
    const orTable = E.buildORTable({tilt: 0});
    const orLamp = E.buildORLamp({aim: [0, 0.2]});
    const anaes = E.buildAnaesthesiaMachine({});
    const instr = E.buildInstrumentTable();
    const scrub = E.buildScrubSink({taps: 2});
    const sscreen = E.buildSurgicalScreen({fold: 0.4});
    const esu = E.buildElectrosurgery({});
    const pacu = E.buildPACUBed({});
    const icu = E.buildICUBed({});
    const or = row('or', 2.4, [
      ['buildORTable', orTable, 2.2],
      ['buildORLamp', orLamp, 2.2],
      ['buildAnaesthesiaMachine', anaes, 2.0],
      ['buildInstrumentTable', instr, 1.8],
      ['buildScrubSink', scrub, 2.6, {wall: true, wallAt: 0.34}],
      ['buildSurgicalScreen', sscreen, 2.8],
      ['buildElectrosurgery', esu, 1.7],
      ['buildPACUBed', pacu, 2.2],
      ['buildICUBed', icu, 2.2],
    ]);
    // hang the lamp over the table, where it belongs
    orLamp.group.position.set(or.buildORTable.x, 0, or.buildORTable.z - 0.25);

    // ward
    const wardBed = E.buildWardBed({head: 0.25});
    const cabinet = E.buildBedsideCabinet();
    const overbed = E.buildOverbedTable({height: 0.95});
    const pumpPole = E.buildIVPole({bags: 1});
    const pump = E.buildInfusionPump({});
    pump.group.position.set(0.02, 1.32, 0.0);
    pumpPole.group.add(pump.group);
    const chartBoard = E.buildChartBoard({});
    row('ward', 1.9, [
      ['buildWardBed', wardBed, 2.2],
      ['buildBedsideCabinet', cabinet, 1.5],
      ['buildOverbedTable', overbed, 1.9],
      ['buildInfusionPump', pumpPole, 1.8],
      ['buildChartBoard', chartBoard, 2.2, {wall: true, wallAt: 0.06}],
    ]);

    // dental + physiotherapy
    const dental = E.buildDentalChair({light: 1, tray: 0.2});
    const dxray = E.buildDentalXray({aim: 0.3});
    const steril = E.buildSteriliser({door: 0.3});
    const pt = E.buildPTTable({head: 0.3});
    const bars = E.buildParallelBars({len: 3.0});
    const bike = E.buildExerciseBike({});
    const tread = E.buildTreadmill({});
    const utherapy = E.buildUltrasoundTherapy({});
    const matset = E.buildMatSet();
    row('dental', 2.2, [
      ['buildDentalChair', dental, 2.8],
      ['buildDentalXray', dxray, 1.9, {wall: true, wallAt: 0.1}],
      ['buildSteriliser', steril, 1.9],
      ['buildPTTable', pt, 2.2],
      ['buildParallelBars', bars, 3.8],
      ['buildExerciseBike', bike, 1.8],
      ['buildTreadmill', tread, 2.0],
      ['buildUltrasoundTherapy', utherapy, 1.8],
      ['buildMatSet', matset, 2.2],
    ]);

    // transport
    const chair = E.buildWheelchair({occupied: false});
    const stretcher = E.buildStretcher({head: 0.25});
    const porter = E.buildPorterTrolley();
    const linen = E.buildLinenCart();
    row('transport', 1.9, [
      ['buildWheelchair', chair, 1.8],
      ['buildStretcher', stretcher, 2.2],
      ['buildPorterTrolley', porter, 2.0],
      ['buildLinenCart', linen, 2.0],
    ]);

    // ---- camera shots
    const mid = (keys) => {
      const ps = keys.map((k) => POS[k]).filter(Boolean);
      return {
        x: ps.reduce((s, p) => s + p.x, 0) / ps.length,
        z: ps.reduce((s, p) => s + p.z, 0) / ps.length,
      };
    };
    const zAll = (Math.max(colZ[0], colZ[1]) - 5.8) / 2;
    const SHOTS = {
      all: {tx: 1.5, ty: 1.0, tz: zAll, d: 57, el: 32, az: 15, fov: 30},
      front: {...mid(['buildFileShelf']), d: 26, ty: 1.2, el: 26, az: 34},
      clinic: {...mid(['buildExamBed', 'buildDoctorChair']), d: 22, ty: 1.0, el: 26, az: 34},
      lab: {...mid(['buildCentrifuge', 'buildMicroscope']), d: 14, ty: 1.1, el: 22, az: 34},
      ct: {...mid(['buildCTScanner']), d: 12, ty: 1.2, el: 17, az: 30},
      imaging: {...mid(['buildXrayTable', 'buildCTScanner']), d: 34, ty: 1.2, el: 28, az: 34},
      pharmacy: {...mid(['buildPharmShelf', 'buildDispenseCounter']), d: 26, ty: 1.3, el: 26, az: 34},
      er: {...mid(['buildERBed', 'buildVitalMonitor', 'buildIVPole']), d: 11, ty: 0.9, el: 19, az: 36},
      or: {...mid(['buildORTable', 'buildORLamp', 'buildAnaesthesiaMachine']), d: 13, ty: 1.2, el: 18, az: 34},
      ward: {...mid(['buildWardBed', 'buildOverbedTable']), d: 18, ty: 1.0, el: 24, az: 34},
      dental: {...mid(['buildDentalChair', 'buildSteriliser']), d: 20, ty: 1.1, el: 24, az: 34},
      physio: {...mid(['buildParallelBars', 'buildTreadmill']), d: 22, ty: 1.0, el: 26, az: 34},
      transport: {...mid(['buildWheelchair', 'buildStretcher']), d: 16, ty: 0.9, el: 24, az: 34},
    };

    const resize = () => st.resize(1600, 900, capture ? devicePixelRatio || 1 : Math.min(devicePixelRatio || 1, 2));
    resize();
    return {
      resize,
      render(t) {
        const s = Math.sin(t * 0.6);
        const beat = t * 1.15; // one heartbeat per 0.87 s
        // front office
        regDesk.setOn(true);
        cashier.setOn(true);
        printer.setPaper(0.4 + 0.4 * Math.sin(t * 1.6));
        kiosk.setOn(true);
        // clinic
        examBed.setHead(0.25 + 0.25 * s);
        examDesk.setOn(true);
        docChair.setSwivel(Math.sin(t * 0.5) * 0.5);
        stool.setSwivel(-t * 0.3);
        curtain.setOpen(0.35 + 0.35 * Math.sin(t * 0.45));
        bp.setOn(true);
        scale.setRod(1.6 + 0.2 * s);
        // lab
        centri.setSpin(t * 9);
        analyser.setLights(t * 0.5);
        analyser.setOn(true);
        phleb.setArm(0.15);
        hatch.setHatch(0.5 + 0.5 * Math.sin(t * 0.5));
        fridge.setDoor(0.25 + 0.2 * Math.sin(t * 0.4));
        // imaging
        xray.setTube(0.7 * Math.sin(t * 0.4));
        booth.setOn(true);
        ct.setBed(0.5 + 0.5 * Math.sin(t * 0.35));
        ct.setRing(t * 3.2);
        ct.setOn(true);
        us.setOn(true);
        ekg.setOn(true);
        viewst.setOn(true);
        // pharmacy
        dispense.setOn(true);
        pillTrolley.setRoll(t * 0.8);
        // emergency
        erBed.setHead(0.3 + 0.2 * s);
        erBed.setRails(0.6 + 0.4 * Math.sin(t * 0.5));
        vitals.setBeat(beat);
        vitals.setOn(true);
        iv.setDrip(t * 1.4);
        crash.setRoll(t * 0.6);
        crash.setOn(true);
        defib.setOn(true);
        defib.setCharge((t * 0.35) % 1);
        vent.setBellows(t * 0.45);
        vent.setOn(true);
        suction.setLevel(0.3 + 0.1 * s);
        // surgery
        orTable.setTilt(0.08 * s);
        orTable.setBack(0.2 + 0.2 * s);
        orLamp.setAim(0.4 * Math.sin(t * 0.35), 0.25 + 0.15 * Math.cos(t * 0.3));
        orLamp.setOn(true);
        anaes.setBellows(t * 0.4);
        anaes.setOn(true);
        instr.setRoll(t * 0.4);
        scrub.setFlow(0.5 + 0.5 * Math.sin(t * 0.8));
        sscreen.setFold(0.35 + 0.25 * Math.sin(t * 0.4));
        esu.setOn(true);
        pacu.setHead(0.3 + 0.2 * Math.sin(t * 0.5 + 1));
        pacu.setRails(1);
        icu.setHead(0.35 + 0.2 * Math.sin(t * 0.45 + 2));
        icu.setKnee(0.15 + 0.1 * s);
        icu.setRails(1);
        icu.setOn(true);
        // ward
        wardBed.setHead(0.25 + 0.2 * Math.sin(t * 0.4));
        overbed.setHeight(0.9 + 0.12 * s);
        pump.setOn(true);
        // dental + physio
        dental.setRecline(0.3 + 0.2 * s);
        dental.setLight(1);
        dental.setTray(0.3 + 0.3 * Math.sin(t * 0.4));
        dxray.setAim(0.4 * Math.sin(t * 0.3));
        steril.setDoor(0.3 + 0.3 * Math.sin(t * 0.5));
        steril.setOn(true);
        pt.setHead(0.3 + 0.25 * s);
        bike.setCrank(t * 3.4);
        tread.setBelt(t * 1.6);
        tread.setOn(true);
        utherapy.setOn(true);
        // transport
        chair.setRoll(t * 1.1);
        stretcher.setRoll(t * 1.1);
        stretcher.setHead(0.25 + 0.2 * s);
        porter.setRoll(t * 0.9);
        linen.setRoll(t * 0.9);

        const c = SHOTS[SHOT] || SHOTS.all;
        st.frame({tx: c.tx ?? c.x, ty: c.ty ?? 1.2, tz: c.tz ?? c.z, az: (c.az ?? 34) * D2R, el: (c.el ?? 28) * D2R, d: c.d, fov: c.fov ?? 28});
        return {};
      },
    };
  },
);
