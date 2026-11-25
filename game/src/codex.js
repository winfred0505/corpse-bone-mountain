// Classical TCM Toxicology Codex (《毒劇本草圖鑑》) — Distilled from 65-slide textbook

const CODEX_DATA = {
  herbs: {
    label: '毒藥本草',
    entries: [
      {
        key: '生川烏・烏頭魔尊',
        title: '川烏・附子・草烏（烏頭屬）',
        tier: '大毒 / 有毒',
        summary: '毛茛科烏頭母根為川烏、子根加工為附子、北烏頭塊根為草烏；含雙酯型烏頭鹼（Aconitine），對心血管與神經系統具劇毒。',
        detail: '【炮製減毒】先煎久煎（30–60 分鐘以上）使雙酯型烏頭鹼水解為苯甲醯烏頭原鹼（毒性降為 1/50–1/500）與烏頭原鹼（1/2000–1/4000）。【解毒】生薑、甘草各 15g 配金銀花 18g 煎服，或綠豆 120g 配甘草 30g、生白蜜；臨床早期洗胃並用抗心律不整藥 amiodarone。',
      },
      {
        key: '生半夏瘴妖',
        title: '生半夏・天南星（天南星科）',
        tier: '有毒',
        summary: '祛痰燥濕藥；生品強烈刺激口腔咽喉黏膜與呼吸系統，嚴重可致窒息。',
        detail: '【用法】3–11.5g，內服須遵照炮製法加工（如薑製、礬製）以減毒。【解毒】服稀醋、濃茶或蛋白；民間方用生薑 30g、防風 60g、甘草 15g 煎湯先含漱後內服。',
      },
      {
        key: '巴豆火毒靈',
        title: '生巴豆（大戟科）',
        tier: '大毒',
        summary: '峻下逐水藥，種子含巴豆油（40–60%）與巴豆毒蛋白，具強烈消化道刺激與生殖毒性。',
        detail: '【用法】0.1–0.5g，須去油製成「巴豆霜」減毒；孕婦禁用，不宜與牽牛子同用。【解毒】生綠豆末 60–90g 冷開水調服、芭蕉汁 100ml；皮膚紅腫可用黃連泡水外搽。',
      },
      {
        key: '甘遂水蠱精',
        title: '生甘遂（大戟科）',
        tier: '有毒',
        summary: '苦寒峻下逐水藥（治腹水），含二萜／三萜類毒性成分，傷腎與生殖系統。',
        detail: '【配伍禁忌】十八反「甘遂反甘草」，切忌與甘草同用！須炮製後用（0.5–1.5g），孕婦禁用。【解毒】薺苨（甜桔梗）30g 或蘆根 120g 水煎服，或菖蒲汁內服。',
      },
      {
        key: '馬錢子（番木鱉）',
        title: '生馬錢子（馬錢科）',
        tier: '有大毒',
        summary: '含番木鱉鹼（Strychnine 1.2–2.2%）與馬錢子鹼，強烈興奮中樞神經致牙關緊閉、強直性痙攣。',
        detail: '【用法】0.3–0.6g，炮製後入丸散用，不宜生用、孕婦禁用。【解毒】將病人安置於黑暗、安靜環境，使用鎮靜抗驚厥藥（如 Diazepam），「禁用嗎啡類藥物」。',
      },
      {
        key: '蟾酥',
        title: '蟾酥（開竅藥）',
        tier: '有毒',
        summary: '中華大蟾蜍耳後腺乾燥分泌物，含強心苷類（蟾蜍毒素），過量引起嚴重心律不整甚至猝死。',
        detail: '【用法】內服僅 0.015–0.03g（多入丸散，如救心丸經酒製減毒），外用不可入目，孕婦禁用。【解毒】洗胃、阿托品抑制迷走神經興奮與對症支持療法。',
      },
    ],
  },
  concepts: {
    label: '毒之五義與分級',
    entries: [
      {
        key: '神農赭鞭',
        title: '神農赭鞭與毒藥五層含意',
        tier: '典籍總論',
        summary: '《搜神記》載神農以「赭鞭」鞭百草以驗平、毒、寒、溫之性——這正是中藥「檢驗觀念」的起點。',
        detail: '中藥的「毒」包含五層含意：①有害（害人）②以毒攻毒（既有害亦有效）③治病之藥（毒藥苦口利於病）④藥之偏性（藥的脾氣，以偏救偏）⑤副作用。《神農本草經》強調「先起如黍栗，病去即止」；《素問》載「大毒治病，十去其六；常毒十去其七；小毒十去其八」。',
      },
      {
        key: 'LD50分級',
        title: '現代毒性分級與劑量範圍',
        tier: '安全標準',
        summary: '臺灣中藥典第三版收載 22 種毒劇中藥材（第四版新增外用「鉛丹」），依安全劑量與口服煎劑 LD50 分級。',
        detail: '【口服生藥煎劑 LD50】大毒 < 5 g/kg｜有毒 5–15 g/kg｜小毒 16–50 g/kg｜無毒 > 50 g/kg。【入丸散劑量】大毒 0.002–1.5g、有毒 0.05–6g、小毒 0.1–6g；入湯劑區間重疊大，不能單憑湯劑劑量判斷毒性高低。',
      },
    ],
  },
  rules: {
    label: '炮製與五專制度',
    entries: [
      {
        key: '炮製目的',
        title: '《雷公炮炙論》炮製減毒原則',
        tier: '減毒工藝',
        summary: '炮製不僅為減毒，更是為了增強療效、改變藥性、去雜提純與矯味矯臭。',
        detail: '搭配《本草經集注》七情「相畏、相殺」配伍原則（如生薑制半夏毒），在藥材製備、處方配伍、劑量與煎煮時間（先煎久煎）層層把關。',
      },
      {
        key: '五專制度',
        title: '五專保管制度與紅底黑字【！！】',
        tier: '法規與院內規範',
        summary: '依《藥事法》第 59、60、64 條，毒劇中藥須憑中醫師簽章處方箋始得調劑出售，違者最高罰鍰 200 萬元。',
        detail: '【五專保管】①專人管理 ②專櫃加鎖（標記黑色「毒」字）③專用帳冊 ④專用紅邊處方 ⑤專冊登記日清月結。【醫院實務（長庚政策）】處方箋與給藥單標示【！！】，藥品以紅底黑字標示「中藥毒劇藥品」，調劑手不直接接觸，投藥須雙人簽名核對。',
      },
    ],
  },
  banned: {
    label: '臺灣禁用品項',
    entries: [
      {
        key: '硃砂（禁用）',
        title: '【！！禁用】硃砂與鉛丹（重金屬）',
        tier: '臺灣公告禁用',
        summary: '含重金屬汞／鉛，危害造血與神經系統。',
        detail: '民國 80 年禁止硃砂、鉛丹用於口服藥品；民國 94 年 5 月 1 日起全面禁止中藥用「硃砂」製造、調劑、輸入、輸出、販賣或陳列。含鉛丹／雄黃製劑須加刊「本品不宜長期使用」。',
      },
      {
        key: '馬兜鈴酸',
        title: '【！！禁用】含馬兜鈴酸五味藥材',
        tier: '臺灣公告禁用',
        summary: '民國 92 年 11 月公告全面禁用五種具嚴重腎毒性與致癌性之中藥材。',
        detail: '全面禁用名單：廣防己、青木香、關木通、馬兜鈴、天仙藤，禁止製造、調劑、輸入、輸出、販賣或陳列。',
      },
      {
        key: '保育類',
        title: '【！！禁用】保育類野生動物藥材',
        tier: '野生動物保育法',
        summary: '禁止處方、調劑與買賣犀牛角、虎骨等保育類藥材。',
        detail: '民國 81–89 年陸續公告禁止犀牛角、虎骨，並規定含穿山甲、熊膽、麝香、羚羊角、龜板等保育類來源須嚴格查核保留憑證。',
      },
    ],
  },
};

export function createCodexUI(getUnlockedSet) {
  const modal = document.createElement('div');
  modal.id = 'codex-modal';
  modal.className = 'hidden';
  modal.innerHTML = `
    <div class="codex-box">
      <div class="codex-head">
        <div class="codex-title">《毒劇本草圖鑑》<span>2026 毒劇中藥材安全性教材復盤</span></div>
        <button class="codex-close" id="codex-close" type="button">合卷（Tab / Esc）</button>
      </div>
      <div class="codex-tabs" id="codex-tabs"></div>
      <div class="codex-body" id="codex-body"></div>
    </div>
  `;
  document.body.appendChild(modal);

  const tabsEl = modal.querySelector('#codex-tabs');
  const bodyEl = modal.querySelector('#codex-body');
  const closeBtn = modal.querySelector('#codex-close');

  let open = false;
  let activeTab = 'herbs';

  function render() {
    const unlocked = getUnlockedSet ? getUnlockedSet() : new Set();
    tabsEl.innerHTML = '';
    Object.entries(CODEX_DATA).forEach(([k, cat]) => {
      const b = document.createElement('button');
      b.className = 'codex-tab' + (k === activeTab ? ' active' : '');
      b.textContent = cat.label;
      b.onclick = () => { activeTab = k; render(); };
      tabsEl.appendChild(b);
    });

    const cat = CODEX_DATA[activeTab];
    bodyEl.innerHTML = cat.entries.map((e) => {
      const seen = unlocked && (unlocked.has ? unlocked.has(e.key) : false);
      const isDanger = e.tier.includes('禁用') || e.tier.includes('大毒');
      return `
        <div class="codex-card ${isDanger ? 'danger' : ''}">
          <div class="cc-top">
            <span class="cc-title">${e.title}</span>
            <span class="cc-tags">
              ${seen ? '<span class="cc-seen">赭鞭已驗 ✓</span>' : ''}
              <span class="cc-tier ${isDanger ? 'danger' : ''}">${e.tier}</span>
            </span>
          </div>
          <div class="cc-sum">${e.summary}</div>
          <div class="cc-det">${e.detail}</div>
        </div>
      `;
    }).join('');
  }

  function setOpen(v) {
    open = v;
    modal.classList.toggle('hidden', !open);
    if (open) render();
  }

  closeBtn.onclick = () => setOpen(false);

  return {
    isOpen: () => open,
    toggle: () => setOpen(!open),
    setOpen,
  };
}
