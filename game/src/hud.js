// Code-drawn Ink-Wash Combat HUD + Boss Bar + Cutscene Dialogue + Victory Summary
export function createCombatHUD() {
  const root = document.createElement('div');
  root.id = 'combat-hud';
  root.innerHTML = `
    <div class="ch-top-left">
      <div class="ch-name">沈青囊 <span class="ch-sub">神農赭鞭</span></div>
      <div class="ch-bar-wrap">
        <div class="ch-bar-delay" id="hp-delay"></div>
        <div class="ch-bar-fill hp" id="hp-fill"></div>
        <span class="ch-bar-txt" id="hp-txt">140 / 140</span>
      </div>
      <div class="ch-bar-wrap small">
        <div class="ch-bar-fill stam" id="stam-fill"></div>
      </div>
      <div class="ch-tox-row">
        <span class="ch-tox-lbl">毒負荷</span>
        <div class="ch-bar-wrap tiny">
          <div class="ch-bar-fill tox" id="tox-fill"></div>
        </div>
        <span class="ch-tox-val" id="tox-val">0%</span>
      </div>
    </div>

    <div class="ch-top-center">
      <div id="ch-zone-banner">屍骨山・山門殘碑</div>
      <div id="ch-alert" class="hidden"></div>
      <div id="ch-riposte" class="hidden">彈反成功！按 <b>J / 左鍵</b> 處決反擊</div>
    </div>

    <div id="ch-boss-bar" class="hidden">
      <div class="boss-header">
        <span class="boss-name">生川烏・千載烏頭魔尊</span>
        <span class="boss-state" id="boss-state">生品大毒・硬打減傷</span>
      </div>
      <div class="boss-track">
        <div class="boss-delay" id="boss-delay"></div>
        <div class="boss-fill" id="boss-fill"></div>
      </div>
    </div>

    <div class="ch-top-right">
      <div class="ch-tools">
        <button id="btn-codex" class="ch-tool-btn" type="button">本草圖鑑 (Tab)</button>
        <button id="btn-mute" class="ch-tool-btn" type="button">音效：開 (M)</button>
      </div>
      <div class="ch-quest" id="ch-quest">目標：深入瘴氣藥谷，以赭鞭辨毒除瘴</div>
      <div class="ch-inspect" id="ch-inspect"></div>
    </div>

    <div class="ch-bottom-bar">
      <div class="ch-skill" id="sk-atk"><div class="sk-key">J</div><div class="sk-lbl">赭鞭</div></div>
      <div class="ch-skill" id="sk-blk"><div class="sk-key">K</div><div class="sk-lbl">格擋彈反</div></div>
      <div class="ch-skill" id="sk-ddg"><div class="sk-key">Space</div><div class="sk-lbl">閃避</div></div>
      <div class="ch-skill" id="sk-dec"><div class="sk-key">Q</div><div class="sk-lbl">文火久煎</div><div class="sk-cd" id="cd-q"></div></div>
      <div class="ch-skill" id="sk-ant"><div class="sk-key">E</div><div class="sk-lbl">解毒湯 <span id="ant-cnt">3</span></div></div>
      <div class="ch-skill ult" id="sk-ult"><div class="sk-key">R</div><div class="sk-lbl">百草印 <span id="ult-pct">0%</span></div><div class="sk-cd" id="cd-r"></div></div>
    </div>

    <div id="ch-toast-stack"></div>

    <div id="ch-gameover" class="hidden">
      <div class="go-title">毒氣攻心・力竭倒地</div>
      <div class="go-sub">未經炮製或過量涉毒，皆可危及性命。</div>
      <button id="btn-retry" type="button">重振旗鼓</button>
    </div>

    <div id="ch-victory" class="hidden">
      <div class="vic-seal">尋藥大成</div>
      <div class="vic-title">炮製熟附子・瘴氣散盡</div>
      <div class="vic-quote">「大毒治病，十去其六；炮製久煎，去其烈性而存回陽之功。」</div>
      <div class="vic-stats" id="vic-stats"></div>
      <div class="vic-lore" id="vic-lore"></div>
      <div style="display:flex;gap:12px;">
        <button id="btn-vic-codex" type="button">查閱《毒劇本草圖鑑》</button>
        <button id="btn-vic-replay" type="button">再闖屍骨山</button>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  // Separate Cutscene Letterbox + Dialogue Layer (stays visible while #combat-hud is hidden!)
  const cine = document.createElement('div');
  cine.id = 'cine-overlay';
  cine.innerHTML = `
    <div class="cine-bar top"></div>
    <div class="cine-bar bot">
      <div class="cine-speaker" id="cine-speaker"></div>
      <div class="cine-text" id="cine-text"></div>
    </div>
  `;
  document.body.appendChild(cine);

  const el = {
    root,
    cine,
    cineSpeaker: cine.querySelector('#cine-speaker'),
    cineText: cine.querySelector('#cine-text'),
    hpFill: root.querySelector('#hp-fill'),
    hpDelay: root.querySelector('#hp-delay'),
    hpTxt: root.querySelector('#hp-txt'),
    stamFill: root.querySelector('#stam-fill'),
    toxFill: root.querySelector('#tox-fill'),
    toxVal: root.querySelector('#tox-val'),
    zone: root.querySelector('#ch-zone-banner'),
    bossBar: root.querySelector('#ch-boss-bar'),
    bossState: root.querySelector('#boss-state'),
    bossFill: root.querySelector('#boss-fill'),
    bossDelay: root.querySelector('#boss-delay'),
    alert: root.querySelector('#ch-alert'),
    riposte: root.querySelector('#ch-riposte'),
    quest: root.querySelector('#ch-quest'),
    inspect: root.querySelector('#ch-inspect'),
    cdQ: root.querySelector('#cd-q'),
    cdR: root.querySelector('#cd-r'),
    antCnt: root.querySelector('#ant-cnt'),
    ultPct: root.querySelector('#ult-pct'),
    skUlt: root.querySelector('#sk-ult'),
    toasts: root.querySelector('#ch-toast-stack'),
    gameover: root.querySelector('#ch-gameover'),
    btnRetry: root.querySelector('#btn-retry'),
    victory: root.querySelector('#ch-victory'),
    vicStats: root.querySelector('#vic-stats'),
    vicLore: root.querySelector('#vic-lore'),
    btnReplay: root.querySelector('#btn-vic-replay'),
    btnVicCodex: root.querySelector('#btn-vic-codex'),
    btnCodex: root.querySelector('#btn-codex'),
    btnMute: root.querySelector('#btn-mute'),
  };

  let delayHpPct = 100;
  let delayBossPct = 100;
  let alertTimer = 0;

  return {
    setVisible(v) {
      root.classList.toggle('visible', v);
    },
    setCutscene(active, speaker = '', text = '') {
      cine.classList.toggle('active', active);
      root.classList.toggle('cutscene-hide', active);
      if (active) {
        el.cineSpeaker.textContent = speaker;
        el.cineText.textContent = text;
      }
    },
    showVictory(statsText, loreItems) {
      el.vicStats.textContent = statsText;
      el.vicLore.innerHTML = loreItems.map((t) => `<div class="vic-lore-item">• ${t}</div>`).join('');
      el.victory.classList.remove('hidden');
    },
    hideVictory() {
      el.victory.classList.add('hidden');
    },
    onRetry(fn) {
      el.btnRetry.onclick = fn;
      el.btnReplay.onclick = fn;
    },
    onCodex(fn) {
      el.btnCodex.onclick = fn;
      el.btnVicCodex.onclick = fn;
    },
    onMute(fn) {
      el.btnMute.onclick = fn;
    },
    setMutedLabel(muted) {
      el.btnMute.textContent = muted ? '音效：靜音 (M)' : '音效：開 (M)';
    },
    showAlert(text, isDanger = true, dur = 3.2) {
      el.alert.textContent = text;
      el.alert.className = isDanger ? 'danger' : 'info';
      alertTimer = dur;
    },
    pushToast(text, tier = 'info') {
      const div = document.createElement('div');
      div.className = 'ch-toast ' + tier;
      div.textContent = text;
      el.toasts.appendChild(div);
      setTimeout(() => div.classList.add('fade'), 2600);
      setTimeout(() => div.remove(), 3300);
    },
    setInspect(text) {
      el.inspect.textContent = text || '';
    },
    setQuest(text) {
      el.quest.textContent = text;
    },
    update(dt, pl, zoneName, boss = null) {
      const hpPct = Math.max(0, Math.min(100, (pl.hp / pl.maxHp) * 100));
      delayHpPct += (hpPct - delayHpPct) * Math.min(1, dt * 4.5);
      el.hpFill.style.width = hpPct + '%';
      el.hpDelay.style.width = Math.max(hpPct, delayHpPct) + '%';
      el.hpTxt.textContent = `${Math.ceil(pl.hp)} / ${pl.maxHp}`;

      const stamPct = Math.max(0, Math.min(100, (pl.stam / pl.maxStam) * 100));
      el.stamFill.style.width = stamPct + '%';

      const toxPct = Math.max(0, Math.min(100, pl.tox));
      el.toxFill.style.width = toxPct + '%';
      el.toxVal.textContent = Math.round(toxPct) + '%';

      el.zone.textContent = zoneName;
      el.antCnt.textContent = pl.antidotes;
      const uPct = Math.floor(Math.min(100, pl.ult));
      el.ultPct.textContent = uPct + '%';
      el.skUlt.classList.toggle('ready', uPct >= 100);

      el.cdQ.style.height = pl.qCd > 0 ? Math.min(100, (pl.qCd / 5.5) * 100) + '%' : '0%';
      el.cdR.style.height = uPct < 100 ? (100 - uPct) + '%' : '0%';

      el.riposte.classList.toggle('hidden', pl.riposteTimer <= 0);
      el.gameover.classList.toggle('hidden', pl.hp > 0);

      // Boss Bar
      const showBoss = !!(boss && boss.alive && boss.engaged);
      el.bossBar.classList.toggle('hidden', !showBoss);
      if (showBoss) {
        const bp = Math.max(0, Math.min(100, (boss.hp / boss.maxHp) * 100));
        delayBossPct += (bp - delayBossPct) * Math.min(1, dt * 3.8);
        el.bossFill.style.width = bp + '%';
        el.bossDelay.style.width = Math.max(bp, delayBossPct) + '%';
        el.bossFill.classList.toggle('broken', boss.decoctionBroken);
        el.bossState.textContent = boss.decoctionBroken
          ? '炮製減毒・破防輸出！'
          : boss.phase2 ? '狂暴反噬・馬錢子痙攣陣' : '生品大毒・硬打減傷';
        el.bossState.classList.toggle('broken', boss.decoctionBroken);
      }

      if (alertTimer > 0) {
        alertTimer -= dt;
        if (alertTimer <= 0) el.alert.className = 'hidden';
      }
    },
  };
}
