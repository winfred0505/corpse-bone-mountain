import * as THREE from 'three';
import { keys, pressed, mouse, endFrame, debugPanel } from './input.js';
import { createTerrain, getHeight, getZoneName } from './terrain.js';
import { createAtmosphere } from './atmosphere.js';
import { createWorldProps } from './props.js';
import { updateOccluders, scanWalkableMap, obstacles } from './collision.js';
import { createPostFX } from './postfx.js';
import {
  createHeroRig,
  createPinelliaRig,
  createCrotonRig,
  createKansuiRig,
  createBossRig,
  HERO_CLIPS,
} from './characters.js';
import { probeHumanoidRig } from './ik.js';
import { createVFXSystem } from './vfx.js';
import { createCombatHUD } from './hud.js';
import { createCombatSystem } from './combat.js';
import { createAudioSystem } from './audio.js';
import { createCodexUI } from './codex.js';
import { createTouchControls } from './touch.js';

const params = new URLSearchParams(location.search);
const showCharMode = params.get('show') === 'char';
const autoStart = params.has('auto') || params.has('stage') || showCharMode;
const stageParam = params.get('stage');
const godMode = params.has('god');
const startMuted = params.has('mute');
const forceTouch = params.has('touch');

const wrap = document.getElementById('canvas-wrap');
const loadingMask = document.getElementById('loading-mask');
const titleScreen = document.getElementById('title-screen');
const btnStart = document.getElementById('btn-start');
const oldHud = document.getElementById('stage1-hud');
if (oldHud) oldHud.style.display = 'none';

const isMobileLike = forceTouch || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobileLike ? 1.5 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NoToneMapping;
wrap.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b151c);
const isPortrait = () => window.innerHeight > window.innerWidth;
const camera = new THREE.PerspectiveCamera(isPortrait() ? 52 : 42, window.innerWidth / window.innerHeight, 0.2, 350);

createTerrain(scene);
const atmosphere = createAtmosphere(scene);
const worldProps = createWorldProps(scene);
const vfx = createVFXSystem(scene);
const combatHUD = createCombatHUD();
const audio = createAudioSystem({ muted: startMuted });
const postfx = createPostFX(renderer, scene, camera);

// Unlock Web Audio on first user gesture
const unlockAudioOnce = () => { audio.unlock(); };
window.addEventListener('pointerdown', unlockAudioOnce, { once: true });
window.addEventListener('keydown', unlockAudioOnce, { once: true });

const hero = createHeroRig();
scene.add(hero.root);

// Cutscene director (zero jump-cut camera handoff per combat-feel.md!)
const cutscene = {
  active: false,
  kind: '', // 'boss_intro' | 'victory'
  t: 0,
  dur: 4.4,
  pendingVictoryData: null,
  camRamp: 1.0, // ramps smoothly from slow to normal after cutscene ends
};

function startBossIntroCutscene() {
  if (!combat.beginBossEncounter()) return;
  cutscene.active = true;
  cutscene.kind = 'boss_intro';
  cutscene.t = 0;
  cutscene.dur = 4.4;
  combatHUD.setCutscene(true, '生川烏・千載烏頭魔尊', '「生烏頭未經久煎，你這小藥師也敢近前？」');
}

function startVictoryCutscene(data) {
  cutscene.active = true;
  cutscene.kind = 'victory';
  cutscene.t = 0;
  cutscene.dur = 3.2;
  cutscene.pendingVictoryData = data;
  combatHUD.setCutscene(true, '沈青囊', '「生烏頭經文火久煎，去其大毒，化為回陽救逆之熟附子。屍骨山瘴氣，散了。」');
}

const combat = createCombatSystem(scene, hero, vfx, combatHUD, {
  godMode,
  audio,
  onBossIntro: startBossIntroCutscene,
  onBossVictory: startVictoryCutscene,
});

const codex = createCodexUI(() => combat.unlockedLore);
const touchUI = createTouchControls({
  forceTouch,
  isPlaying: () => state.mode === 'explore' && !cutscene.active && !codex.isOpen() && combat.pl.hp > 0,
  onUnlockAudio: () => audio.unlock(),
});
combatHUD.onCodex(() => codex.toggle());
combatHUD.onMute(() => {
  audio.unlock();
  audio.setMuted(!audio.isMuted());
  combatHUD.setMutedLabel(audio.isMuted());
});
combatHUD.setMutedLabel(audio.isMuted());

const startZ = stageParam === 'altar' ? -16.5 : stageParam === 'valley' ? 8 : 25;
combat.pl.pos.set(0, getHeight(0, startZ), startZ);
hero.root.position.copy(combat.pl.pos);

// Showcase Mode (?show=char)
let showcase = null;
if (showCharMode) {
  const panel = document.getElementById('char-showcase');
  const titleEl = document.getElementById('sc-title');
  const charsEl = document.getElementById('sc-chars');
  const actsEl = document.getElementById('sc-actions');
  const probeEl = document.getElementById('sc-probe');
  panel.classList.add('visible');

  hero.root.visible = false;
  combat.enemies.forEach((e) => (e.rig.root.visible = false));

  const pedestalPos = new THREE.Vector3(0, getHeight(0, 24), 24);
  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(1.9, 2.2, 0.22, 24),
    new THREE.MeshStandardMaterial({ color: 0x263136, roughness: 0.8, metalness: 0.15 })
  );
  pedestal.position.set(pedestalPos.x, pedestalPos.y + 0.05, pedestalPos.z);
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  const keyLight = new THREE.PointLight(0xffe0b8, 9.0, 12, 1.5);
  keyLight.position.set(pedestalPos.x + 2.4, pedestalPos.y + 3.2, pedestalPos.z + 2.8);
  scene.add(keyLight);
  const rim = new THREE.PointLight(0x6ec4d8, 6.0, 10, 1.5);
  rim.position.set(pedestalPos.x - 2.6, pedestalPos.y + 2.6, pedestalPos.z - 2.2);
  scene.add(rim);

  const roster = [
    { id: 'hero', label: '沈青囊(主角)', rig: createHeroRig(), isHero: true, camDist: 3.7, camH: 1.55 },
    { id: 'pinellia', label: '生半夏瘴妖', rig: createPinelliaRig(), isHero: false, camDist: 3.5, camH: 1.45 },
    { id: 'croton', label: '巴豆火毒靈', rig: createCrotonRig(), isHero: false, camDist: 3.5, camH: 1.55 },
    { id: 'kansui', label: '甘遂水蠱精', rig: createKansuiRig(), isHero: false, camDist: 3.6, camH: 1.5 },
    { id: 'boss', label: '烏頭魔尊(Boss)', rig: createBossRig(), isHero: false, camDist: 5.8, camH: 2.35 },
  ];
  roster.forEach((item) => {
    item.rig.root.position.set(pedestalPos.x, pedestalPos.y + 0.16, pedestalPos.z);
    item.rig.root.visible = false;
    scene.add(item.rig.root);
  });

  const heroActions = ['idle', 'run', 'atk1', 'atk2', 'atk3', 'block', 'dodge', 'skill'];
  const enemyActions = ['idle', 'attack'];

  showcase = {
    idx: 0, action: 'atk1', actionTime: 0, angle: 0.45, bossBroken: false, roster, pedestalPos, probeEl,
    selectChar(i) {
      this.idx = i;
      roster.forEach((r, k) => (r.rig.root.visible = k === i));
      const cur = roster[i];
      titleEl.textContent = `角色展示台：${cur.label}`;
      this.action = cur.isHero ? 'atk1' : 'idle';
      this.actionTime = 0;
      renderButtons();
    },
    selectAction(act) { this.action = act; this.actionTime = 0; renderButtons(); },
  };

  function renderButtons() {
    charsEl.innerHTML = '';
    roster.forEach((r, i) => {
      const b = document.createElement('button');
      b.className = 'sc-btn' + (i === showcase.idx ? ' active' : '');
      b.textContent = r.label;
      b.onclick = () => showcase.selectChar(i);
      charsEl.appendChild(b);
    });
    actsEl.innerHTML = '';
    const cur = roster[showcase.idx];
    (cur.isHero ? heroActions : enemyActions).forEach((act) => {
      const b = document.createElement('button');
      b.className = 'sc-btn' + (act === showcase.action ? ' active' : '');
      b.textContent = act;
      b.onclick = () => showcase.selectAction(act);
      actsEl.appendChild(b);
    });
    if (cur.id === 'boss') {
      const b = document.createElement('button');
      b.className = 'sc-btn' + (showcase.bossBroken ? ' active' : '');
      b.textContent = showcase.bossBroken ? '狀態：炮製減毒' : '狀態：生品大毒';
      b.onclick = () => {
        showcase.bossBroken = !showcase.bossBroken;
        cur.rig.setDecoctionBroken(showcase.bossBroken);
        renderButtons();
      };
      actsEl.appendChild(b);
    }
  }
  showcase.selectChar(0);
}

const state = {
  mode: showCharMode ? 'showcase' : autoStart ? 'explore' : 'title',
  time: 0,
  focus: combat.pl.pos.clone(),
  camPos: new THREE.Vector3(combat.pl.pos.x, combat.pl.pos.y + 13.5, combat.pl.pos.z + 16.5),
  camTarget: new THREE.Vector3(combat.pl.pos.x, combat.pl.pos.y + 1.2, combat.pl.pos.z),
  zoom: 1.0,
  frames: 0,
  scanResult: scanWalkableMap(),
};

const camOffset = new THREE.Vector3(0, 13.5, 16.5);

function getDesiredGameplayCam() {
  const boss = combat.getBoss();
  const focus = combat.pl.pos.clone();
  // Gently bias camera focus toward Boss during Boss fight, leashed <= 3.2m from hero!
  if (boss && boss.alive && boss.engaged) {
    const toBoss = boss.pos.clone().sub(combat.pl.pos);
    const len = toBoss.length();
    if (len > 0.1) {
      focus.addScaledVector(toBoss.normalize(), Math.min(3.2, len * 0.25));
    }
  }
  const portraitZoom = isPortrait() ? 1.18 : 1.0;
  const desiredPos = new THREE.Vector3(
    focus.x + camOffset.x * state.zoom * portraitZoom + (isMobileLike ? 0 : mouse.x * 0.85),
    focus.y + camOffset.y * state.zoom * portraitZoom,
    focus.z + camOffset.z * state.zoom * portraitZoom + (isMobileLike ? 0 : mouse.y * 0.5)
  );
  desiredPos.y = Math.max(desiredPos.y, getHeight(desiredPos.x, desiredPos.z) + 2.5);
  const desiredTarget = new THREE.Vector3(focus.x, focus.y + 1.25, focus.z);
  return { desiredPos, desiredTarget, focus };
}

function enterGame() {
  if (state.mode !== 'title') return;
  state.mode = 'explore';
  titleScreen.classList.add('hidden');
  combatHUD.setVisible(true);
  combatHUD.pushToast('「毒藥苦口利於病，然未經炮製，良藥亦成索命之毒。」', 'info');
}

btnStart.addEventListener('click', enterGame);
window.addEventListener('wheel', (e) => {
  if (state.mode !== 'explore') return;
  state.zoom = Math.max(0.92, Math.min(1.32, state.zoom + Math.sign(e.deltaY) * 0.05));
}, { passive: true });

window.addEventListener('resize', () => {
  const w = window.innerWidth, h = window.innerHeight;
  camera.fov = h > w ? 52 : 42;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  postfx.resize(w, h);
});

const updateDebug = debugPanel(() => {
  const pl = combat.pl;
  const boss = combat.getBoss();
  const alive = combat.enemies.filter((e) => e.alive).length;
  return `mode: ${state.mode} | cine: ${cutscene.active ? cutscene.kind : '-'} | hp: ${Math.ceil(pl.hp)}/${pl.maxHp}\nhero: ${pl.pos.x.toFixed(1)}, ${pl.pos.z.toFixed(1)} | boss: ${boss ? `${Math.ceil(boss.hp)}/${boss.maxHp} p2:${boss.phase2} brk:${boss.decoctionBroken}` : '-'}\nenemies: ${alive} | obstacles: ${obstacles.length}`;
});

function updateCutscene(dt) {
  cutscene.t += dt;
  const boss = combat.getBoss();
  hero.applyPose('idle', state.time, 0, dt);
  if (boss && boss.alive) boss.rig.update(state.time, 'idle');

  if (cutscene.kind === 'boss_intro') {
    const bp = boss ? boss.pos : new THREE.Vector3(0, getHeight(0, -29.2), -29.2);
    if (cutscene.t < 1.8) {
      // Frame towering Boss & purple cauldron
      const p = new THREE.Vector3(bp.x + 3.2, bp.y + 4.4, bp.z + 8.5);
      const tgt = new THREE.Vector3(bp.x, bp.y + 2.2, bp.z);
      state.camPos.lerp(p, Math.min(1, dt * 3.5));
      state.camTarget.lerp(tgt, Math.min(1, dt * 3.5));
    } else if (cutscene.t < 3.3) {
      combatHUD.setCutscene(true, '沈青囊', '「神農赭鞭在此。毒藥之偏，當以文火炮製去其烈性。」');
      const p = new THREE.Vector3(-4.5, combat.pl.pos.y + 5.2, -14.8);
      const tgt = new THREE.Vector3(0, bp.y + 1.8, -25.0);
      state.camPos.lerp(p, Math.min(1, dt * 3.2));
      state.camTarget.lerp(tgt, Math.min(1, dt * 3.2));
    } else {
      // Smoothly align directly to exact gameplay camera position before handoff!
      const { desiredPos, desiredTarget } = getDesiredGameplayCam();
      state.camPos.lerp(desiredPos, Math.min(1, dt * 5.2));
      state.camTarget.lerp(desiredTarget, Math.min(1, dt * 5.2));
    }

    if (cutscene.t >= cutscene.dur || pressed.has('Escape')) {
      cutscene.active = false;
      cutscene.camRamp = 0.2;
      combatHUD.setCutscene(false);
      combat.engageBossAfterCutscene();
    }
  } else if (cutscene.kind === 'victory') {
    const p = new THREE.Vector3(combat.pl.pos.x + 5.0, combat.pl.pos.y + 4.6, combat.pl.pos.z + 7.5);
    const tgt = new THREE.Vector3(combat.pl.pos.x, combat.pl.pos.y + 1.4, combat.pl.pos.z);
    state.camPos.lerp(p, Math.min(1, dt * 2.5));
    state.camTarget.lerp(tgt, Math.min(1, dt * 2.5));

    if (cutscene.t >= cutscene.dur || pressed.has('Escape')) {
      cutscene.active = false;
      combatHUD.setCutscene(false);
      const d = cutscene.pendingVictoryData;
      if (d) {
        const mins = Math.floor(d.elapsed / 60);
        const secs = Math.floor(d.elapsed % 60).toString().padStart(2, '0');
        combatHUD.showVictory(
          `耗時 ${mins}:${secs} ｜ 擊敗毒妖 ${d.kills} 隻 ｜ 淨化禁用硃砂礦 ${d.purifiedMines}/2`,
          d.lore.length ? d.lore : ['生川烏：含雙酯型烏頭鹼，須先煎久煎水解減毒。']
        );
      }
    }
  }

  state.focus.copy(combat.pl.pos);
  camera.position.copy(state.camPos);
  camera.lookAt(state.camTarget);
}

function updateLogic(dt) {
  state.time += dt;

  // Global Tab (Codex pause) & M (Mute toggle)
  if (state.mode === 'explore') {
    if (pressed.has('Tab')) codex.toggle();
    if (pressed.has('Escape') && codex.isOpen()) codex.setOpen(false);
    if (pressed.has('KeyM')) {
      audio.unlock();
      audio.setMuted(!audio.isMuted());
      combatHUD.setMutedLabel(audio.isMuted());
    }
    if (codex.isOpen()) return;
  }

  // Dynamic pentatonic / Boss crisis music state (explore / battle / boss / boss_p2) + cutscene ducking
  const boss = combat.getBoss();
  if (boss && boss.alive && (boss.engaged || (cutscene.active && cutscene.kind === 'boss_intro'))) {
    audio.setMusicState(boss.phase2 ? 'boss_p2' : 'boss');
  } else if (combat.enemies.some((e) => e.alive && !e.isBoss && e.aiState !== 'idle')) {
    audio.setMusicState('battle');
  } else {
    audio.setMusicState('explore');
  }
  audio.setDucked(cutscene.active);
  audio.update(dt);

  if (state.mode === 'showcase' && showcase) {
    const cur = showcase.roster[showcase.idx];
    showcase.actionTime += dt;
    if (keys.has('KeyA')) showcase.angle -= dt * 1.4;
    if (keys.has('KeyD')) showcase.angle += dt * 1.4;
    showcase.angle += dt * 0.18;
    if (cur.isHero) {
      const clip = HERO_CLIPS[showcase.action];
      if (clip && showcase.actionTime > clip.duration + 0.35) showcase.actionTime = 0;
      cur.rig.applyPose(showcase.action, showcase.actionTime, showcase.action === 'run' ? 7 : 0, dt);
      const p = probeHumanoidRig(cur.rig);
      showcase.probeEl.textContent = `IK Joint Probe (local m)\nHip Y : ${p.hipY}\nRHand : ${p.rHand}\nLHand : ${p.lHand}\nRFoot : ${p.rFoot}\nLFoot : ${p.lFoot}`;
    } else {
      cur.rig.update(showcase.actionTime, showcase.action);
      showcase.probeEl.textContent = `Monster Rig: ${cur.label}\nMode: ${showcase.action}\nRotate: A / D`;
    }
    const pp = showcase.pedestalPos;
    camera.position.set(pp.x + Math.sin(showcase.angle) * cur.camDist, pp.y + cur.camH, pp.z + Math.cos(showcase.angle) * cur.camDist);
    camera.lookAt(pp.x, pp.y + cur.camH * 0.72, pp.z);
    state.focus.copy(pp);
    return;
  }

  if (state.mode === 'explore') {
    if (cutscene.active) {
      updateCutscene(dt);
      return;
    }

    combat.update(dt, keys, pressed);
    cutscene.camRamp = Math.min(1.0, cutscene.camRamp + dt * 1.4);
    const { desiredPos, desiredTarget, focus } = getDesiredGameplayCam();
    state.focus.copy(focus);

    const lerpRate = Math.min(1, dt * (6.0 * cutscene.camRamp));
    state.camPos.lerp(desiredPos, lerpRate);
    state.camTarget.lerp(desiredTarget, lerpRate);
    combatHUD.update(dt, combat.pl, getZoneName(combat.pl.pos.z), combat.getBoss());
  } else {
    hero.applyPose('idle', state.time, 0, dt);
    const a = Math.sin(state.time * 0.14) * 0.22;
    const tx = Math.sin(a) * 14;
    const tz = 34 + Math.cos(a) * 10;
    const ty = Math.max(getHeight(tx, tz) + 6.5, 11.5);
    state.camPos.set(tx, ty, tz);
    state.camTarget.set(0, 2.6, 12.0);
    state.focus.set(0, getHeight(0, 18), 18);
  }

  camera.position.copy(state.camPos);
  camera.lookAt(state.camTarget);
  updateOccluders(state.camPos, state.focus, dt);
}

function frame(dt) {
  updateLogic(dt);
  atmosphere.update(state.time, dt, state.focus);
  worldProps.update(state.time, dt);
  vfx.update(state.time, dt, state.mode === 'explore' ? combat.pl.pos : null, combat.onLootCollected);
  postfx.render(state.time);
  updateDebug();
  endFrame();
  state.frames++;
}

frame(1 / 60);
loadingMask.classList.add('hidden');
if (showCharMode) {
  // Showcase visible
} else if (autoStart) {
  combatHUD.setVisible(true);
} else {
  titleScreen.classList.remove('hidden');
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.G = {
  step: (n = 60, dt = 1 / 60) => { for (let i = 0; i < n; i++) frame(dt); return state.frames; },
  upd: (n = 30, dt = 1 / 60) => { for (let i = 0; i < n; i++) updateLogic(dt); return combat.pl.pos.clone(); },
  press: (...codes) => codes.forEach((c) => pressed.add(c)),
  triggerBoss: startBossIntroCutscene,
  scanWalkable: scanWalkableMap,
  pl: () => combat.pl,
  boss: () => combat.getBoss(),
  enemies: () => combat.enemies,
  fx: vfx,
  keys,
  mouse,
  state,
  cam: camera,
};
