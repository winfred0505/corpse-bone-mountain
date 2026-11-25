import * as THREE from 'three';
import { getHeight } from './terrain.js';
import { resolveMovement, interactables } from './collision.js';
import { touchMove } from './input.js';
import {
  createPinelliaRig,
  createCrotonRig,
  createKansuiRig,
  createBossRig,
  HERO_CLIPS,
} from './characters.js';

function createEnemyBadge(name, tier, maxHp) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sp.scale.set(2.3, 0.58, 1);

  function redraw(hp, broken = false) {
    ctx.clearRect(0, 0, 256, 64);
    const tierCol = tier === '大毒' ? '#d94862' : tier === '有毒' ? '#e09a3e' : '#6cc99b';
    ctx.font = 'bold 20px "DFKai-SB", "BiauKai", serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = tierCol;
    ctx.fillText(`[${broken ? '炮製減毒' : tier}] ${name}`, 128, 22);

    ctx.fillStyle = 'rgba(10, 14, 18, 0.8)';
    ctx.fillRect(28, 32, 200, 12);
    const pct = Math.max(0, Math.min(1, hp / maxHp));
    ctx.fillStyle = broken ? '#e8b648' : '#b8322a';
    ctx.fillRect(30, 34, 196 * pct, 8);
    ctx.strokeStyle = 'rgba(218, 202, 168, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(28, 32, 200, 12);
    tex.needsUpdate = true;
  }
  redraw(maxHp, false);
  return { sprite: sp, redraw };
}

export function createCombatSystem(scene, hero, vfx, hud, { godMode = false, audio = null, onBossIntro = null, onBossVictory = null } = {}) {
  const enemies = [];
  const projectiles = [];
  const groundHazards = [];
  const unlockedLore = new Map();

  // Boss Arena Southern Seal Wall (low vertical-fade mist rune barrier so it never blocks camera view!)
  const sealMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.45 } },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform float uTime, uOpacity;
      varying vec2 vUv;
      void main() {
        float fadeY = (1.0 - smoothstep(0.05, 1.0, vUv.y));
        float fadeX = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.85, 1.0, vUv.x));
        float wave = 0.72 + 0.28 * sin(vUv.x * 24.0 + uTime * 3.0);
        float alpha = fadeY * fadeX * wave * uOpacity;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(1.3, 0.35, 1.85, alpha);
      }
    `,
  });
  const sealWall = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 1.45), sealMat);
  sealWall.position.set(0, getHeight(0, -16.8) + 0.72, -16.8);
  sealWall.visible = false;
  scene.add(sealWall);

  const pl = {
    pos: new THREE.Vector3(0, getHeight(0, 25), 25),
    yaw: Math.PI,
    hp: 140,
    maxHp: 140,
    stam: 100,
    maxStam: 100,
    tox: 0,
    ult: 25,
    antidotes: 3,
    qCd: 0,
    action: 'idle',
    actionTime: 0,
    speed: 0,
    comboBuffer: false,
    didHitThisSwing: false,
    hitstop: 0,
    stunTimer: 0, // Brief neural spasm from Strychnine (馬錢子)
    iframe: 0,
    riposteTimer: 0,
    riposteTarget: null,
    slowMoTimer: 0,
    godMode,
    purifiedMines: 0,
    kills: 0,
    elapsed: 0,
    arenaSealed: false,
    bossIntroDone: false,
    victoryShown: false,
  };

  function spawnEnemy(kind, x, z) {
    let rig, name, tier, maxHp, radius, badgeH, loot, loreText;
    if (kind === 'pinellia') {
      rig = createPinelliaRig();
      name = '生半夏瘴妖'; tier = '有毒'; maxHp = 95; radius = 0.72; badgeH = 2.15;
      loreText = '生半夏（天南星科）：辛溫有毒，刺激咽喉呼吸；須炮製減毒，解毒用生薑、防風、甘草。';
      loot = { kind: 'antidote', name: '生薑防風解毒湯', tier: '良方', desc: '生薑30g+防風60g+甘草15g：專解半夏、天南星之毒。' };
    } else if (kind === 'croton') {
      rig = createCrotonRig();
      name = '巴豆火毒靈'; tier = '大毒'; maxHp = 85; radius = 0.68; badgeH = 2.35;
      loreText = '巴豆（大戟科）：辛熱有大毒，含巴豆油與毒蛋白；須製「巴豆霜」減毒，解毒用生綠豆末。';
      loot = { kind: 'antidote', name: '生綠豆末解毒方', tier: '有毒', desc: '生綠豆末冷開水調服：緩解巴豆毒蛋白刺激。' };
    } else if (kind === 'kansui') {
      rig = createKansuiRig();
      name = '甘遂水蠱精'; tier = '有毒'; maxHp = 105; radius = 0.72; badgeH = 2.45;
      loreText = '甘遂（大戟科）：苦寒有毒，峻下逐水；「十八反」反甘草！解毒宜用薺苨或蘆根汁。';
      loot = { kind: 'antidote', name: '薺苨蘆根解毒汁', tier: '有毒', desc: '薺苨／蘆根水煎服：解甘遂之毒（切忌配甘草）。' };
    } else {
      rig = createBossRig();
      name = '生川烏・烏頭魔尊'; tier = '大毒'; maxHp = 380; radius = 1.25; badgeH = 3.85;
      loreText = '生川烏（毛茛科）：含雙酯型烏頭鹼，心血管與神經大毒；須「先煎久煎」水解減毒 1/50–1/4000！';
      loot = { kind: 'herb', name: '炮製熟附子', tier: '大毒', desc: '回陽救逆之良藥：經炮製久煎去毒存效。' };
    }

    const y = getHeight(x, z);
    rig.root.position.set(x, y, z);
    const badge = createEnemyBadge(name, tier, maxHp);
    badge.sprite.position.set(0, badgeH, 0);
    if (kind === 'boss') badge.sprite.visible = false; // Boss uses top-center Boss Bar!
    rig.root.add(badge.sprite);
    scene.add(rig.root);

    const e = {
      kind, name, tier, rig, badge, loot, loreText,
      pos: new THREE.Vector3(x, y, z),
      yaw: 0,
      hp: maxHp,
      maxHp,
      radius,
      alive: true,
      isBoss: kind === 'boss',
      engaged: false,
      phase2: false,
      bossMove: 'cleave', // cleave | shockwave | thorns | spasm | doubleSlash
      bossMoveStep: 0,
      decoctionBroken: false,
      decoctionTimer: 0,
      aiState: 'idle',
      aiTimer: 0.5 + Math.random() * 0.7,
      hitstop: 0,
      shakeTimer: 0,
      windupDur: 0.8,
      didAttack: false,
      telegraph: null,
    };
    enemies.push(e);
    return e;
  }

  let bossRef = null;

  function spawnInitialWave() {
    enemies.forEach((e) => scene.remove(e.rig.root));
    enemies.length = 0;
    projectiles.forEach((p) => scene.remove(p.mesh));
    projectiles.length = 0;
    groundHazards.length = 0;

    spawnEnemy('pinellia', -3.2, 6.8);
    spawnEnemy('pinellia', 3.6, 4.2);
    spawnEnemy('croton', 4.5, -1.8);
    spawnEnemy('kansui', -2.8, -5.2);
    bossRef = spawnEnemy('boss', 0, -29.2);
  }
  spawnInitialWave();

  function getBoss() { return bossRef; }

  // Called safely right before Boss cutscene begins (combat-feel.md: place player safely inside BEFORE sealing!)
  function beginBossEncounter() {
    if (!bossRef || !bossRef.alive || pl.bossIntroDone) return false;
    pl.bossIntroDone = true;
    // Place hero safely inside the Bone Altar arena before sealing southern exit
    pl.pos.set(0, getHeight(0, -20.5), -20.5);
    pl.yaw = Math.PI;
    pl.action = 'idle';
    pl.actionTime = 0;
    hero.root.position.copy(pl.pos);
    hero.root.rotation.y = pl.yaw;
    pl.arenaSealed = true;
    sealWall.visible = true;
    return true;
  }

  function engageBossAfterCutscene() {
    if (!bossRef || !bossRef.alive) return;
    bossRef.engaged = true;
    bossRef.aiState = 'chase';
    bossRef.aiTimer = 0.6;
    hud.setQuest('目標：以「文火久煎訣(Q)」或「彈反(K)」破除生川烏・烏頭魔尊毒甲！');
  }

  function findMagnetTarget(maxDist = 5.4) {
    let best = null, bestScore = Infinity;
    const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);
    for (const e of enemies) {
      if (!e.alive || (e.isBoss && !e.engaged)) continue;
      const dx = e.pos.x - pl.pos.x, dz = e.pos.z - pl.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > maxDist) continue;
      const dot = (dx * fx + dz * fz) / Math.max(0.01, d);
      const score = d - dot * 1.4;
      if (score < bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  function damageEnemy(e, rawDmg, { heavy = false, decoction = false, dir = null } = {}) {
    if (!e.alive) return;
    let dmg = rawDmg;
    if (e.isBoss && !e.decoctionBroken && !decoction) {
      dmg = Math.max(5, Math.round(rawDmg * 0.35));
      hud.showAlert('【生川烏大毒護甲】硬打減傷！請用 Q「文火久煎訣」或彈反破甲！', false, 2.5);
    }
    if (decoction && e.isBoss) {
      e.decoctionBroken = true;
      e.decoctionTimer = 11.5;
      if (e.rig.setDecoctionBroken) e.rig.setDecoctionBroken(true);
      hud.showAlert('炮製成功！雙酯型烏頭鹼水解為苯甲醯烏頭原鹼（毒性大減・破防輸出！）', false, 3.6);
    }

    let interrupted = false;
    if (e.aiState === 'windup' && e.aiTimer > e.windupDur * 0.45 && (!e.isBoss || e.decoctionBroken)) {
      interrupted = true;
      dmg = Math.round(dmg * 1.35);
      e.aiState = 'stagger';
      e.aiTimer = 1.15;
      if (e.telegraph) { e.telegraph.cancel(); e.telegraph = null; }
      hud.pushToast(`破招打斷！對 ${e.name} 造成 ${dmg} 傷害`, 'good');
    }

    e.hp = Math.max(0, e.hp - dmg);
    e.badge.redraw(e.hp, e.decoctionBroken);
    e.shakeTimer = heavy ? 0.22 : 0.12;

    pl.hitstop = heavy ? 0.105 : 0.065;
    e.hitstop = heavy ? 0.12 : 0.075;
    if (audio) audio.playHit(heavy || decoction);

    const hitDir = dir || new THREE.Vector3(e.pos.x - pl.pos.x, 0, e.pos.z - pl.pos.z).normalize();
    const contact = pl.pos.clone().lerp(e.pos, 0.65);
    contact.y += 1.1;
    vfx.spawnSparks(contact, hitDir, heavy ? 16 : 10, decoction ? [2.5, 1.3, 0.3] : [2.4, 1.6, 0.7]);

    const kb = e.isBoss ? (heavy ? 0.45 : 0.15) : (heavy ? 1.35 : 0.55);
    const res = resolveMovement(e.pos.x, e.pos.z, e.pos.x + hitDir.x * kb, e.pos.z + hitDir.z * kb, e.radius);
    e.pos.x = res.x; e.pos.z = res.z;

    if (heavy && !interrupted && !e.isBoss) {
      e.aiState = 'stagger';
      e.aiTimer = 0.65;
    }

    pl.ult = Math.min(100, pl.ult + (heavy ? 12 : 7));
    hud.setInspect(`赭鞭驗毒：${e.loreText}`);
    unlockedLore.set(e.name, e.loreText);

    // Boss Phase 2 transition at 50% HP!
    if (e.isBoss && !e.phase2 && e.hp > 0 && e.hp <= e.maxHp * 0.5) {
      e.phase2 = true;
      e.decoctionBroken = false;
      e.decoctionTimer = 0;
      if (e.rig.setDecoctionBroken) e.rig.setDecoctionBroken(false);
      e.aiState = 'recover';
      e.aiTimer = 1.4;
      vfx.spawnMagicCircle(e.pos.x, e.pos.z, 6.2, 1.2, { color: [2.2, 0.4, 2.5] });
      vfx.spawnSparks(e.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), new THREE.Vector3(0, 1, 0), 26, [2.2, 0.5, 2.5]);
      hud.showAlert('烏頭魔尊：「好個文火久煎……那便嘗嘗這番木鱉之痙攣！」', false, 4.0);
      unlockedLore.set('馬錢子（番木鱉）', '馬錢子：含番木鱉鹼（Strychnine），有大毒，致神經強直性痙攣；解毒須置黑暗安靜處、禁用嗎啡。');
    }

    if (e.hp <= 0) {
      e.alive = false;
      if (e.telegraph) { e.telegraph.cancel(); e.telegraph = null; }
      scene.remove(e.rig.root);
      pl.kills++;
      vfx.spawnSparks(e.pos.clone().add(new THREE.Vector3(0, 1.2, 0)), new THREE.Vector3(0, 1, 0), 28, [2.4, 1.9, 0.7]);
      vfx.spawnLoot(e.pos.x, e.pos.z, e.loot);
      if (audio) audio.playLoot(e.loot.tier);
      hud.pushToast(`擊敗 ${e.name}！掉落【${e.loot.name}】`, 'good');

      if (e.isBoss) {
        pl.arenaSealed = false;
        sealWall.visible = false;
        projectiles.forEach((p) => scene.remove(p.mesh));
        projectiles.length = 0;
        groundHazards.length = 0;
        if (onBossVictory) {
          onBossVictory({
            elapsed: pl.elapsed,
            kills: pl.kills,
            purifiedMines: pl.purifiedMines,
            lore: [...unlockedLore.values()],
          });
        }
      }
      updateQuestText();
    }
  }

  function updateQuestText() {
    const valleyAlive = enemies.filter((e) => e.alive && !e.isBoss).length;
    const bossAlive = bossRef && bossRef.alive;
    if (valleyAlive > 0) {
      hud.setQuest(`目標：清剿瘴氣藥谷毒妖（剩餘 ${valleyAlive} 隻）並淨化禁用硃砂礦（${pl.purifiedMines}/2）`);
    } else if (bossAlive) {
      hud.setQuest('目標：北上煉毒骨壇，直面生川烏・烏頭魔尊！');
    } else {
      hud.setQuest('尋藥大成！已成功炮製「熟附子」，淨化屍骨山瘴氣！');
    }
  }
  updateQuestText();

  function checkWorldSwingHits(reach, arcDot = 0.25) {
    const fx = Math.sin(pl.yaw), fz = Math.cos(pl.yaw);

    // 1. Deflect projectiles (Croton fireballs & Boss Aconite thorns!)
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      const d = Math.hypot(p.pos.x - pl.pos.x, p.pos.z - pl.pos.z);
      if (d < reach + 0.75) {
        vfx.spawnSparks(p.pos, new THREE.Vector3(fx, 0.3, fz), 12, [2.5, 1.2, 0.3]);
        scene.remove(p.mesh);
        projectiles.splice(i, 1);
        pl.ult = Math.min(100, pl.ult + 10);
        hud.pushToast(`赭鞭劈散${p.label || '毒彈'}！`, 'good');
      }
    }

    // 2. Purify Forbidden Cinnabar Mines
    for (const item of interactables) {
      if (item.kind !== 'cinnabar' || !item.active) continue;
      const d = Math.hypot(item.x - pl.pos.x, item.z - pl.pos.z);
      if (d < reach + 1.2) {
        item.active = false;
        pl.purifiedMines++;
        scene.remove(item.root);
        vfx.spawnSparks(new THREE.Vector3(item.x, getHeight(item.x, item.z) + 0.8, item.z), new THREE.Vector3(0, 1, 0), 20, [2.5, 0.4, 0.3]);
        vfx.spawnLoot(item.x, item.z, {
          kind: 'antidote',
          name: '甘草薺苨通解汁',
          tier: '良方',
          desc: '《金匱要略》：煮甘草薺苨汁飲之，通除諸毒藥。',
        });
        hud.showAlert('【！！臺灣公告禁用】硃砂（含汞）— 民國 94 年 5 月起全面禁用！已淨化！', true, 4.2);
        if (audio) { audio.playAlert(true); audio.playLoot('良方'); }
        unlockedLore.set('硃砂（禁用）', '硃砂（含重金屬汞）：民國 94 年 5 月起臺灣全面禁止中藥用硃砂製造、調劑、販賣。');
        updateQuestText();
      }
    }

    // 3. Enemies inside forward arc
    const isHeavy = pl.action === 'atk3';
    const dmg = pl.action === 'atk1' ? 20 : pl.action === 'atk2' ? 24 : 38;
    for (const e of enemies) {
      if (!e.alive || (e.isBoss && !e.engaged)) continue;
      const dx = e.pos.x - pl.pos.x, dz = e.pos.z - pl.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > reach + e.radius) continue;
      const dot = (dx * fx + dz * fz) / Math.max(0.01, d);
      if (dot < arcDot && d > 1.35) continue;
      damageEnemy(e, dmg, { heavy: isHeavy });
    }
  }

  function applyDamageToPlayer(dmg, toxGain, attacker, { unblockable = false, cause = '', stun = 0 } = {}) {
    if (pl.hp <= 0) return;

    if (pl.action === 'dodge' && pl.actionTime < 0.28) {
      pl.slowMoTimer = 0.22;
      pl.stam = Math.min(pl.maxStam, pl.stam + 25);
      pl.ult = Math.min(100, pl.ult + 14);
      vfx.spawnSparks(pl.pos.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0, 1, 0), 10, [0.7, 2.1, 2.2]);
      hud.pushToast('極限閃避！體力與百草印回復', 'good');
      return;
    }

    if (pl.iframe > 0) return;

    if (pl.action === 'block' && !unblockable) {
      if (pl.actionTime <= 0.26) {
        if (audio) audio.playParry();
        pl.hitstop = 0.08;
        pl.ult = Math.min(100, pl.ult + 20);
        pl.riposteTimer = 1.0;
        pl.riposteTarget = attacker;
        vfx.spawnMagicCircle(pl.pos.x, pl.pos.z, 2.1, 0.55, { color: [2.5, 1.9, 0.5] });
        vfx.spawnSparks(pl.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), new THREE.Vector3(0, 1, 0), 18, [2.6, 2.1, 0.7]);
        if (attacker && attacker.alive) {
          attacker.aiState = 'stagger';
          attacker.aiTimer = 1.45;
          if (attacker.isBoss && !attacker.decoctionBroken) {
            attacker.decoctionBroken = true;
            attacker.decoctionTimer = 11.0;
            if (attacker.rig.setDecoctionBroken) attacker.rig.setDecoctionBroken(true);
            hud.showAlert('彈反破勢！烏頭魔尊生毒護甲震裂！', false, 3.0);
          }
        }
        return;
      } else if (pl.stam >= 18) {
        if (audio) audio.playGuard();
        pl.stam -= 18;
        pl.hitstop = 0.05;
        vfx.spawnSparks(pl.pos.clone().add(new THREE.Vector3(0, 1.1, 0)), new THREE.Vector3(0, 0.5, 0), 8, [1.5, 1.8, 2.2]);
        hud.pushToast('格擋成功', 'info');
        return;
      }
    }

    if (!pl.godMode) {
      pl.hp = Math.max(0, pl.hp - dmg);
      pl.tox = Math.min(100, pl.tox + toxGain);
      if (stun > 0) pl.stunTimer = Math.max(pl.stunTimer, stun);
    }
    pl.iframe = 0.55;
    pl.hitstop = 0.07;
    if (audio) audio.playPlayerHit();
    vfx.spawnSparks(pl.pos.clone().add(new THREE.Vector3(0, 1, 0)), new THREE.Vector3(0, 0.6, 0), 10, [2.2, 0.3, 0.4]);
    if (cause) hud.pushToast(cause, 'warn');
  }

  function drinkAntidote() {
    if (pl.antidotes <= 0 || pl.hp <= 0) return;
    pl.antidotes--;

    const inKansuiHazard = groundHazards.some((h) => h.kind === 'kansui' && Math.hypot(pl.pos.x - h.x, pl.pos.z - h.z) < h.radius + 0.5);
    if (inKansuiHazard) {
      if (!pl.godMode) pl.hp = Math.max(10, pl.hp - 18);
      pl.tox = Math.min(100, pl.tox + 25);
      if (audio) audio.playAlert(true);
      hud.showAlert('【！！十八反警告】甘遂反甘草！在甘遂水毒陣中服甘草湯反而中毒加重！', true, 4.2);
      return;
    }

    pl.hp = Math.min(pl.maxHp, pl.hp + 55);
    pl.tox = Math.max(0, pl.tox - 65);
    pl.stunTimer = 0;
    if (audio) audio.playAntidote();
    vfx.spawnMagicCircle(pl.pos.x, pl.pos.z, 1.8, 0.65, { color: [0.55, 2.1, 1.35] });
    hud.pushToast('飲用解毒湯：回氣 +55、毒負荷大幅消退（先起如黍栗，中病即止）', 'good');
  }

  function resetPlayer() {
    hud.hideVictory();
    pl.hp = pl.maxHp;
    pl.stam = pl.maxStam;
    pl.tox = 0;
    pl.ult = 25;
    pl.antidotes = 3;
    pl.stunTimer = 0;
    pl.elapsed = 0;
    pl.kills = 0;
    pl.arenaSealed = false;
    pl.bossIntroDone = false;
    pl.victoryShown = false;
    sealWall.visible = false;
    pl.pos.set(0, getHeight(0, 25), 25);
    pl.action = 'idle';
    pl.actionTime = 0;
    spawnInitialWave();
    updateQuestText();
  }
  hud.onRetry(resetPlayer);

  function update(rawDt, keys, pressed) {
    let dt = rawDt;
    if (pl.slowMoTimer > 0) {
      pl.slowMoTimer -= rawDt;
      dt = rawDt * 0.35;
    }

    if (pl.hp <= 0) {
      hero.applyPose('idle', 0, 0, dt);
      return;
    }

    pl.elapsed += rawDt;

    // Trigger Boss Intro Cutscene when stepping into Northern Bone Altar!
    if (!pl.bossIntroDone && bossRef && bossRef.alive && pl.pos.z < -17.5) {
      if (onBossIntro) {
        onBossIntro();
        return;
      }
    }

    if (pl.iframe > 0) pl.iframe -= dt;
    if (pl.qCd > 0) pl.qCd -= dt;
    if (pl.riposteTimer > 0) pl.riposteTimer -= dt;

    // Brief Strychnine neural spasm stun
    if (pl.stunTimer > 0) {
      pl.stunTimer -= dt;
      hero.root.position.set(pl.pos.x + (Math.random() - 0.5) * 0.12, pl.pos.y, pl.pos.z + (Math.random() - 0.5) * 0.12);
      updateEnemiesAndHazards(dt);
      return;
    }

    if (pl.action !== 'block' && pl.action !== 'dodge') {
      const regen = pl.tox > 50 ? 15 : 28;
      pl.stam = Math.min(pl.maxStam, pl.stam + regen * dt);
    }
    if (pl.tox > 55 && !pl.godMode) pl.hp = Math.max(1, pl.hp - 2.6 * dt);
    pl.tox = Math.max(0, pl.tox - 1.4 * dt);

    if (pressed.has('KeyE')) drinkAntidote();

    if (pressed.has('KeyR') && pl.ult >= 100 && pl.action !== 'dodge') {
      if (audio) audio.playUlt();
      pl.ult = 0;
      pl.tox = 0;
      pl.hp = Math.min(pl.maxHp, pl.hp + 30);
      pl.action = 'skill';
      pl.actionTime = 0;
      vfx.spawnMagicCircle(pl.pos.x, pl.pos.z, 7.2, 1.35, { color: [2.4, 1.85, 0.55] });
      hud.showAlert('神農百草印！百毒退散・大範圍炮製淨化！', false, 3.0);
      for (const e of enemies) {
        if (e.alive && (!e.isBoss || e.engaged) && Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z) < 7.8) {
          damageEnemy(e, 68, { heavy: true, decoction: true });
        }
      }
    }

    if (pl.hitstop > 0) {
      pl.hitstop -= rawDt;
      if (pressed.has('KeyJ') || pressed.has('LMB')) pl.comboBuffer = true;
      if (pressed.has('Space') || pressed.has('ShiftLeft')) {
        pl.hitstop = 0;
      } else {
        updateEnemiesAndHazards(dt);
        return;
      }
    }

    let mx = touchMove.x, mz = touchMove.z;
    if (keys.has('KeyW')) mz -= 1;
    if (keys.has('KeyS')) mz += 1;
    if (keys.has('KeyA')) mx -= 1;
    if (keys.has('KeyD')) mx += 1;
    const hasMove = Math.hypot(mx, mz) > 0.08;

    if ((pressed.has('Space') || pressed.has('ShiftLeft')) && pl.stam >= 16) {
      if (pl.action !== 'dodge') {
        if (audio) audio.playDodge();
        pl.stam -= 16;
        pl.action = 'dodge';
        pl.actionTime = 0;
        pl.comboBuffer = false;
        if (hasMove) pl.yaw = Math.atan2(mx, mz);
      }
    } else if (pressed.has('KeyQ') && pl.qCd <= 0 && pl.action !== 'dodge') {
      if (audio) audio.playDecoction();
      pl.qCd = 5.5;
      pl.action = 'skill';
      pl.actionTime = 0;
      pl.comboBuffer = false;
      pl.didHitThisSwing = false;
      vfx.spawnMagicCircle(pl.pos.x, pl.pos.z, 4.8, 1.05, { color: [2.5, 1.15, 0.25] });
    } else if (pressed.has('KeyJ') || pressed.has('LMB')) {
      if (pl.riposteTimer > 0 && pl.riposteTarget && pl.riposteTarget.alive) {
        const tgt = pl.riposteTarget;
        pl.riposteTimer = 0;
        pl.riposteTarget = null;
        pl.slowMoTimer = 0.25;
        const dx = tgt.pos.x - pl.pos.x, dz = tgt.pos.z - pl.pos.z;
        pl.yaw = Math.atan2(dx, dz);
        if (Math.hypot(dx, dz) > 1.8) {
          const res = resolveMovement(pl.pos.x, pl.pos.z, tgt.pos.x - Math.sin(pl.yaw) * 1.6, tgt.pos.z - Math.cos(pl.yaw) * 1.6, 0.55);
          pl.pos.x = res.x; pl.pos.z = res.z;
        }
        pl.action = 'atk3';
        pl.actionTime = 0.22;
        pl.didHitThisSwing = true;
        vfx.spawnSlashArc(pl.pos, pl.yaw, { vertical: true, color: [2.6, 2.0, 0.65], scale: 1.35, duration: 0.34 });
        damageEnemy(tgt, 74, { heavy: true, decoction: true });
        hud.pushToast('處決反擊！重創要害！', 'good');
      } else if (pl.action === 'idle' || pl.action === 'run' || pl.action === 'block') {
        startAttack('atk1');
      } else if (pl.action === 'atk1' || pl.action === 'atk2') {
        pl.comboBuffer = true;
      }
    } else if ((keys.has('KeyK') || keys.has('RMB')) && (pl.action === 'idle' || pl.action === 'run')) {
      pl.action = 'block';
      pl.actionTime = 0;
    }

    function startAttack(name) {
      pl.action = name;
      pl.actionTime = 0;
      pl.comboBuffer = false;
      pl.didHitThisSwing = false;
      const mag = findMagnetTarget(5.4);
      if (mag) pl.yaw = Math.atan2(mag.pos.x - pl.pos.x, mag.pos.z - pl.pos.z);
      else if (hasMove) pl.yaw = Math.atan2(mx, mz);
    }

    pl.actionTime += dt;
    let stepSpeed = 0;

    if (pl.action === 'dodge') {
      const clip = HERO_CLIPS.dodge;
      stepSpeed = 13.0 * (1 - pl.actionTime / clip.duration);
      const res = resolveMovement(pl.pos.x, pl.pos.z, pl.pos.x + Math.sin(pl.yaw) * stepSpeed * dt, pl.pos.z + Math.cos(pl.yaw) * stepSpeed * dt, 0.55);
      pl.pos.x = res.x; pl.pos.z = res.z;
      if (pl.actionTime >= clip.duration) { pl.action = 'idle'; pl.actionTime = 0; }
    } else if (pl.action.startsWith('atk')) {
      const clip = HERO_CLIPS[pl.action];
      if (pl.actionTime >= clip.hitWindow[0] - 0.06 && pl.actionTime <= clip.hitWindow[1]) {
        const mag = findMagnetTarget(5.0);
        let slide = 4.2 * dt;
        if (mag) {
          const d = Math.hypot(mag.pos.x - pl.pos.x, mag.pos.z - pl.pos.z);
          slide = Math.max(0, Math.min(slide, d - (mag.radius + 1.15)));
        }
        if (slide > 0) {
          const res = resolveMovement(pl.pos.x, pl.pos.z, pl.pos.x + Math.sin(pl.yaw) * slide, pl.pos.z + Math.cos(pl.yaw) * slide, 0.55);
          pl.pos.x = res.x; pl.pos.z = res.z;
        }
      }
      if (!pl.didHitThisSwing && pl.actionTime >= clip.hitWindow[0]) {
        pl.didHitThisSwing = true;
        if (audio) audio.playWhip(pl.action === 'atk3');
        vfx.spawnSlashArc(pl.pos, pl.yaw, {
          vertical: pl.action === 'atk3',
          reverse: pl.action === 'atk2',
          scale: pl.action === 'atk3' ? 1.2 : 1.0,
        });
        checkWorldSwingHits(pl.action === 'atk3' ? 3.2 : 2.8);
      }
      if (pl.actionTime >= clip.duration * 0.74 && pl.comboBuffer) {
        startAttack(pl.action === 'atk1' ? 'atk2' : 'atk3');
      } else if (pl.actionTime >= clip.duration) {
        pl.action = 'idle'; pl.actionTime = 0; pl.comboBuffer = false;
      }
    } else if (pl.action === 'skill') {
      const clip = HERO_CLIPS.skill;
      if (!pl.didHitThisSwing && pl.actionTime >= clip.hitWindow[0]) {
        pl.didHitThisSwing = true;
        if (audio) audio.playWhip(pl.action === 'atk3');
        for (const e of enemies) {
          if (e.alive && (!e.isBoss || e.engaged) && Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z) < 5.1) {
            damageEnemy(e, 34, { heavy: true, decoction: true });
          }
        }
      }
      if (pl.actionTime >= clip.duration) { pl.action = 'idle'; pl.actionTime = 0; }
    } else if (pl.action === 'block') {
      if (!keys.has('KeyK') && !keys.has('RMB')) { pl.action = 'idle'; pl.actionTime = 0; }
    } else {
      if (hasMove) {
        const len = Math.hypot(mx, mz);
        const speedMax = 7.4;
        const res = resolveMovement(pl.pos.x, pl.pos.z, pl.pos.x + (mx / len) * speedMax * dt, pl.pos.z + (mz / len) * speedMax * dt, 0.55);
        pl.pos.x = res.x; pl.pos.z = res.z;
        const targetYaw = Math.atan2(mx, mz);
        let diff = targetYaw - pl.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        pl.yaw += diff * Math.min(1, dt * 14);
        stepSpeed = speedMax;
        if (pl.action !== 'run') { pl.action = 'run'; pl.actionTime = 0; }
      } else if (pl.action !== 'idle') {
        pl.action = 'idle'; pl.actionTime = 0;
      }
    }

    // Keep hero inside sealed Boss Altar during Boss fight
    if (pl.arenaSealed && pl.pos.z > -17.6) pl.pos.z = -17.6;

    // Body separation
    if (pl.action !== 'dodge') {
      for (const e of enemies) {
        if (!e.alive) continue;
        const dx = pl.pos.x - e.pos.x, dz = pl.pos.z - e.pos.z;
        const d = Math.hypot(dx, dz);
        const minD = 0.55 + e.radius;
        if (d < minD && d > 1e-4) {
          const push = (minD - d) * 0.55;
          const r1 = resolveMovement(pl.pos.x, pl.pos.z, pl.pos.x + (dx / d) * push, pl.pos.z + (dz / d) * push, 0.55);
          pl.pos.x = r1.x; pl.pos.z = r1.z;
        }
      }
    }

    pl.pos.y = getHeight(pl.pos.x, pl.pos.z);
    pl.speed = stepSpeed;
    hero.root.position.copy(pl.pos);
    hero.root.rotation.y = pl.yaw;
    hero.applyPose(pl.action, pl.actionTime, stepSpeed, dt);

    updateEnemiesAndHazards(dt);
  }

  function pickBossMove(e, dist) {
    if (e.phase2) {
      const pool = dist < 4.8 ? ['doubleSlash', 'shockwave', 'spasm'] : ['spasm', 'thorns', 'cleave'];
      return pool[Math.floor(Math.random() * pool.length)];
    }
    const pool = dist < 4.8 ? ['cleave', 'shockwave'] : ['thorns', 'cleave'];
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function updateEnemiesAndHazards(dt) {
    const nowS = performance.now() * 0.001;
    if (sealWall.visible) sealMat.uniforms.uTime.value = nowS;

    const someoneMeleeAttacking = enemies.some((e) => e.alive && !e.isBoss && e.kind === 'pinellia' && e.aiState === 'windup');

    for (const e of enemies) {
      if (!e.alive) continue;
      if (e.decoctionBroken) {
        e.decoctionTimer -= dt;
        if (e.decoctionTimer <= 0) {
          e.decoctionBroken = false;
          if (e.rig.setDecoctionBroken) e.rig.setDecoctionBroken(false);
          e.badge.redraw(e.hp, false);
        }
      }

      if (e.hitstop > 0) {
        e.hitstop -= dt;
        if (e.shakeTimer > 0) {
          e.rig.root.position.set(e.pos.x + (Math.random() - 0.5) * 0.16, e.pos.y, e.pos.z + (Math.random() - 0.5) * 0.16);
        }
        continue;
      }

      // Boss stays idle until intro cutscene engages it; valley mobs outside seal de-aggro during Boss fight
      if (e.isBoss && !e.engaged) {
        e.rig.update(nowS, 'idle');
        continue;
      }
      if (pl.arenaSealed && !e.isBoss && e.pos.z > -16.8) {
        e.aiState = 'idle';
        e.rig.update(nowS, 'idle');
        continue;
      }

      const dx = pl.pos.x - e.pos.x, dz = pl.pos.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      const aggroRange = e.isBoss ? 22.0 : 13.5;

      if (e.aiState === 'stagger') {
        e.aiTimer -= dt;
        if (e.aiTimer <= 0) { e.aiState = 'chase'; e.aiTimer = 0.5; }
        e.rig.update(nowS, 'idle');
      } else if (dist > aggroRange && e.aiState === 'idle') {
        e.rig.update(nowS, 'idle');
      } else {
        e.yaw = Math.atan2(dx, dz);
        e.rig.root.rotation.y = e.yaw;
        if (e.aiState === 'idle') e.aiState = 'chase';

        if (e.aiState === 'chase') {
          const desired = e.kind === 'croton' ? 7.5 : e.kind === 'kansui' ? 6.2 : e.isBoss ? 3.5 : 2.1;
          if (dist > desired) {
            const spd = e.isBoss ? (e.phase2 ? 4.4 : 3.5) : 3.8;
            const res = resolveMovement(e.pos.x, e.pos.z, e.pos.x + (dx / dist) * spd * dt, e.pos.z + (dz / dist) * spd * dt, e.radius);
            e.pos.x = res.x; e.pos.z = res.z;
          }
          e.aiTimer -= dt;
          const canAct = e.isBoss ? (e.aiTimer <= 0) : (dist <= desired + 0.5 && e.aiTimer <= 0 && (e.kind !== 'pinellia' || !someoneMeleeAttacking));
          if (canAct) {
            e.aiState = 'windup';
            e.aiTimer = 0;
            e.didAttack = false;
            if (e.isBoss) {
              e.bossMove = pickBossMove(e, dist);
              e.bossMoveStep = 0;
              e.windupDur = e.bossMove === 'shockwave' ? 1.05 : e.bossMove === 'spasm' ? 0.9 : 0.85;
              if (e.bossMove === 'spasm') {
                // Phase 2: 馬錢子痙攣陣 — 3 staggered warning circles around player!
                for (let k = 0; k < 3; k++) {
                  const ox = k === 0 ? 0 : (Math.random() - 0.5) * 6.0;
                  const oz = k === 0 ? 0 : (Math.random() - 0.5) * 6.0;
                  const hx = pl.pos.x + ox, hz = pl.pos.z + oz;
                  const delay = 1.05 + k * 0.25;
                  vfx.spawnMagicCircle(hx, hz, 2.5, delay, { color: [2.3, 0.55, 2.4], isWarning: true });
                  groundHazards.push({ kind: 'strychnine', x: hx, z: hz, radius: 2.5, timer: delay, owner: e });
                }
              } else {
                const rad = e.bossMove === 'shockwave' ? 5.2 : 3.8;
                e.telegraph = vfx.spawnMagicCircle(e.pos.x, e.pos.z, rad, e.windupDur, { color: [2.2, 0.35, 0.45], isWarning: true });
              }
            } else if (e.kind === 'kansui') {
              e.windupDur = 1.15;
              const hx = pl.pos.x, hz = pl.pos.z;
              e.telegraph = vfx.spawnMagicCircle(hx, hz, 2.7, e.windupDur, { color: [0.32, 1.55, 2.2], isWarning: true });
              groundHazards.push({ kind: 'kansui', x: hx, z: hz, radius: 2.7, timer: e.windupDur, owner: e });
            } else {
              e.windupDur = 0.78;
              e.telegraph = vfx.spawnMagicCircle(e.pos.x, e.pos.z, 2.2, e.windupDur, { color: [2.2, 0.35, 0.3], isWarning: true });
            }
          }
          e.rig.update(nowS, 'idle');
        } else if (e.aiState === 'windup') {
          e.aiTimer += dt;
          e.rig.update(nowS, 'attack');
          if (!e.didAttack && e.aiTimer >= e.windupDur) {
            e.didAttack = true;
            e.telegraph = null;

            if (e.isBoss) {
              if (e.bossMove === 'thorns') {
                // 3-way fan of deflectable Aconite Thorns
                const baseAng = Math.atan2(dx, dz);
                for (const off of [-0.28, 0, 0.28]) {
                  const a = baseAng + off;
                  const orb = new THREE.Mesh(
                    new THREE.OctahedronGeometry(0.30, 0),
                    new THREE.MeshBasicMaterial({ color: new THREE.Color(1.9, 0.45, 2.4) })
                  );
                  const start = e.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
                  orb.position.copy(start);
                  scene.add(orb);
                  projectiles.push({
                    mesh: orb, pos: start,
                    vel: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)).multiplyScalar(10.5),
                    life: 3.0, owner: e, label: '雙酯毒棘',
                  });
                }
              } else if (e.bossMove === 'shockwave') {
                vfx.spawnMagicCircle(e.pos.x, e.pos.z, 5.4, 0.55, { color: [2.2, 0.35, 2.5] });
                vfx.spawnSparks(e.pos.clone().add(new THREE.Vector3(0, 1.0, 0)), new THREE.Vector3(0, 1, 0), 20, [2.1, 0.4, 2.4]);
                if (dist <= 5.4) {
                  applyDamageToPlayer(20, 26, e, { unblockable: true, cause: '烏頭鹼心悸震波！（範圍技須閃避）' });
                }
              } else if (e.bossMove === 'cleave' || e.bossMove === 'doubleSlash') {
                vfx.spawnSlashArc(e.pos, e.yaw, { color: [1.9, 0.4, 2.4], scale: 1.55, reverse: e.bossMoveStep === 1 });
                if (dist <= 4.3) {
                  applyDamageToPlayer(18, 22, e, { cause: '生川烏骨刃重斬！心血管毒負荷上升！' });
                }
                if (e.bossMove === 'doubleSlash' && e.bossMoveStep === 0) {
                  e.bossMoveStep = 1;
                  e.didAttack = false;
                  e.aiTimer = 0.25;
                  e.windupDur = 0.72;
                  continue;
                }
              }
            } else if (e.kind === 'croton') {
              const orb = new THREE.Mesh(
                new THREE.SphereGeometry(0.28, 8, 8),
                new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.75, 0.18) })
              );
              const start = e.pos.clone().add(new THREE.Vector3(0, 1.25, 0));
              orb.position.copy(start);
              scene.add(orb);
              projectiles.push({ mesh: orb, pos: start, vel: new THREE.Vector3(dx, 0, dz).normalize().multiplyScalar(9.5), life: 3.2, owner: e, label: '巴豆火彈' });
            } else if (e.kind !== 'kansui') {
              vfx.spawnSlashArc(e.pos, e.yaw, { color: [0.6, 2.0, 0.8], scale: 0.9 });
              if (dist <= 2.6) {
                applyDamageToPlayer(12, 16, e, { cause: '生半夏毒霧侵襲！呼吸阻滯！' });
              }
            }

            e.aiState = 'recover';
            e.aiTimer = e.isBoss ? (e.phase2 ? 1.05 : 1.35) : 1.15;
          }
        } else if (e.aiState === 'recover') {
          e.aiTimer -= dt;
          if (e.aiTimer <= 0) {
            e.aiState = 'chase';
            e.aiTimer = e.isBoss ? (e.phase2 ? 0.45 : 0.7) : (0.65 + Math.random() * 0.6);
          }
          e.rig.update(nowS, 'idle');
        }
      }

      e.pos.y = getHeight(e.pos.x, e.pos.z);
      e.rig.root.position.copy(e.pos);
    }

    // Update projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);
      if (Math.hypot(p.pos.x - pl.pos.x, p.pos.z - pl.pos.z) < 0.85) {
        applyDamageToPlayer(14, 18, p.owner, { cause: `${p.label || '毒彈'}命中！毒負荷上升！` });
        scene.remove(p.mesh);
        projectiles.splice(i, 1);
      } else if (p.life <= 0) {
        scene.remove(p.mesh);
        projectiles.splice(i, 1);
      }
    }

    // Update ground eruption hazards
    for (let i = groundHazards.length - 1; i >= 0; i--) {
      const h = groundHazards[i];
      h.timer -= dt;
      if (h.timer <= 0) {
        const d = Math.hypot(pl.pos.x - h.x, pl.pos.z - h.z);
        const col = h.kind === 'strychnine' ? [2.3, 0.55, 2.4] : [0.35, 1.7, 2.3];
        vfx.spawnSparks(new THREE.Vector3(h.x, getHeight(h.x, h.z) + 0.5, h.z), new THREE.Vector3(0, 1, 0), 16, col);
        if (d < h.radius) {
          if (h.kind === 'strychnine') {
            applyDamageToPlayer(16, 20, h.owner, {
              unblockable: true,
              stun: 0.65,
              cause: '馬錢子痙攣陣命中！番木鱉鹼引發神經強直抽搐！',
            });
          } else {
            applyDamageToPlayer(18, 22, h.owner, {
              unblockable: true,
              cause: '甘遂水毒湧泉爆發！（範圍技不可格擋，須閃避）',
            });
          }
        }
        groundHazards.splice(i, 1);
      }
    }
  }

  return {
    pl,
    enemies,
    unlockedLore,
    getBoss,
    beginBossEncounter,
    engageBossAfterCutscene,
    update,
    resetPlayer,
    onLootCollected(item) {
      if (item.kind === 'antidote') pl.antidotes++;
      hud.pushToast(`拾取【${item.name}】— ${item.desc}`, 'good');
      hud.setInspect(item.desc);
    },
  };
}
