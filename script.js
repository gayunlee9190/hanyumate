/* ════════════════════════════════════════════════
   나만의 중국어 AI 친구 — script.js (API 기반)

   - 예시 문장 하드코딩(mock 분석) 전부 제거
   - 모든 문장을 실제 AI API로 분석 (fetch + async/await)
   - JSON 응답 파싱 / 로딩 UI / 오류 처리 포함
   - 기존 UI(3열 대시보드 · 노트 · 다크모드 · 발음 · 복사)는 유지

   구성
   [1] 정적 데이터 (오늘의 중국어 · Z세대 표현 — 분석과 무관한 학습 콘텐츠)
   [2] 저장소(Store) · 앱 상태
   [3] API 호출 계층 (backend / direct-anthropic / direct-openai)
   [4] 프롬프트 빌드 & JSON 파싱
   [5] 단계별 로딩 UI
   [6] 결과 렌더링
   [7] 패널 / 노트 / Z세대 / 유틸(발음·복사·토스트)
   [8] 이벤트 바인딩 & 초기화
   ════════════════════════════════════════════════ */

/* ─────────────────────────────────────────
   [1] 정적 데이터
   (※ 문장 분석에는 쓰이지 않음. 대시보드/사전 콘텐츠일 뿐)
   ───────────────────────────────────────── */
const SITUATIONS = {
  friend: { label: '친구와 대화', tone: '편하고 친근한 반말체' },
  school: { label: '학교 발표', tone: '정중하고 또렷한 발표체' },
  travel: { label: '여행', tone: '간단하고 실용적인 여행 회화체' },
  sns: { label: 'SNS', tone: '짧고 트렌디한 인터넷 말투' },
  formal: { label: '공식 표현', tone: '예의 바르고 격식 있는 표현' },
};

const TODAY_PHRASES = [
  { cn: '加油！', py: 'Jiāyóu!', ko: '힘내! / 파이팅!' },
  { cn: '慢慢来。', py: 'Màn man lái.', ko: '천천히 해.' },
  { cn: '没关系。', py: 'Méi guānxi.', ko: '괜찮아.' },
  { cn: '我请客！', py: 'Wǒ qǐngkè!', ko: '내가 쏠게!' },
  { cn: '太厉害了！', py: 'Tài lìhai le!', ko: '정말 대단하다!' },
  { cn: '改天再说。', py: 'Gǎitiān zài shuō.', ko: '다음에 다시 얘기하자.' },
  { cn: '随便你。', py: 'Suíbiàn nǐ.', ko: '네 마음대로 해.' },
];

const SLANG = [
  { term: 'YYDS', py: 'yǒng yuǎn de shén', mean: '영원한 신 (永远的神)', desc: '최고를 칭찬할 때. "GOAT", "역대급"과 비슷해요.' },
  { term: '绝绝子', py: 'jué jué zǐ', mean: '완전 최고 / 너무 별로', desc: '극찬 또는 반어적 비난 모두에 쓰는 유행어. 맥락으로 의미가 갈립니다.' },
  { term: '666', py: 'liù liù liù', mean: '잘한다! 멋지다!', desc: '"6"이 "牛(대단하다)"와 통해서, 게임·라이브에서 감탄으로 도배됩니다.' },
  { term: 'awsl', py: 'a wǒ sǐ le', mean: '아 나 죽었다(귀여워서)', desc: '"啊我死了"의 약자. 너무 귀여워 "심쿵사"할 때.' },
  { term: 'xswl', py: 'xiào sǐ wǒ le', mean: '웃겨 죽겠다', desc: '"笑死我了"의 약자. 한국어 "ㅋㅋㅋ"와 비슷.' },
  { term: '破防了', py: 'pò fáng le', mean: '멘탈 무너졌다', desc: '게임 용어(방어 깨짐)에서 와서, 감정이 북받칠 때 씁니다.' },
  { term: '内卷', py: 'nèi juǎn', mean: '과도한 경쟁', desc: '한국 "무한경쟁"과 비슷. 다 같이 피곤해지는 상황.' },
  { term: 'emo了', py: 'emo le', mean: '우울해졌다', desc: '영어 emo + 了. 갑자기 센치해지거나 기분이 가라앉을 때.' },
];

/* ─────────────────────────────────────────
   [2] 저장소 & 앱 상태
   ───────────────────────────────────────── */
const Store = (() => {
  let mem = {}; let ok = true;
  try { const t = '__t__'; localStorage.setItem(t, '1'); localStorage.removeItem(t); }
  catch (e) { ok = false; }
  return {
    read(k, d) { try { if (ok) { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } } catch (e) {} return k in mem ? mem[k] : d; },
    write(k, v) { try { if (ok) { localStorage.setItem(k, JSON.stringify(v)); return; } } catch (e) {} mem[k] = v; },
  };
})();

const APP = {
  direction: 'ko2cn',
  situation: 'friend',
  apiKey: '', // direct 모드에서만 사용 · 메모리에만 보관(저장 안 함)
  lastInput: '',
  saved: Store.read('caf_saved', []),
  recent: Store.read('caf_recent', []),
  learnedCount: Store.read('caf_learned', 0),
  theme: Store.read('caf_theme', 'light'),
};
function persist() {
  Store.write('caf_saved', APP.saved);
  Store.write('caf_recent', APP.recent);
  Store.write('caf_learned', APP.learnedCount);
  Store.write('caf_theme', APP.theme);
}

/* ─────────────────────────────────────────
   [4] 프롬프트 빌드 & JSON 파싱
   ───────────────────────────────────────── */
// AI에게 보낼 지시문. 결과 카드 9개 항목에 맞춘 JSON 스키마를 강제한다.
function buildPrompt(text, direction, situationId) {
  const dirText = direction === 'ko2cn' ? '한국어를 중국어로' : '중국어를 한국어로';
  const situ = SITUATIONS[situationId] || SITUATIONS.friend;

  return `너는 한국인 중국어 학습자를 돕는 친절한 중국어 선생님이다.
학습자가 입력한 문장을 ${dirText} 번역하고, 단순 번역을 넘어 "왜 그렇게 말하는지" 학습 피드백을 제공한다.
한국어식 중국어 오류 교정, 직역 위험 설명, 상황/관계별 표현 차이, 중국 문화·실제 회화 맥락, 문법 원인 분석에 집중한다.

[입력 문장]
${text}

[사용 상황]
${situ.label} (${situ.tone})

아래 JSON 형식으로만 응답하라. 마크다운·설명·코드펜스 없이 순수 JSON만 출력한다.
모든 한국어 설명은 고등학생도 이해하기 쉽게, 따뜻하고 친근한 말투로 작성한다.
병음에는 성조 부호(ā á ǎ à)를 정확히 표기한다.

{
  "natural": "가장 자연스러운 번역(대상 언어)",
  "naturalPinyin": "번역문이 중국어면 병음, 아니면 빈 문자열",
  "literal": "직역했을 때의 어색한 표현",
  "literalNote": "직역이 어색한 이유 1~2문장",
  "grammar": "핵심 문법 포인트 2~3문장",
  "errors": [
    {"type": "오류 유형(한국어식 어순/직역 위험/상황 부적절/부자연스러운 표현/존댓말 처리 등)", "desc": "구체적 설명. 핵심 단어는 [대괄호]로 감싸기", "isGood": false}
  ],
  "situations": [
    {"tag": "친구", "cn": "표현", "py": "병음"},
    {"tag": "발표", "cn": "표현", "py": "병음"},
    {"tag": "SNS", "cn": "표현", "py": "병음"},
    {"tag": "공식", "cn": "표현", "py": "병음"}
  ],
  "conversation": [
    {"cn": "실제 자주 쓰는 회화 표현", "py": "병음", "ko": "한국어 뜻"}
  ],
  "culture": "관련 중국 문화/뉘앙스 설명 2~3문장",
  "hsk": {"level": 1, "label": "HSK 1급", "desc": "난이도 한 줄"},
  "recommend": [
    {"cn": "추천 현지 표현", "py": "병음", "ko": "뜻"}
  ]
}

규칙:
- 오류가 없으면 errors에 {"type":"잘 쓴 표현","desc":"칭찬과 이유","isGood":true} 를 넣어라.
- situations 2~4개, conversation 1~3개, recommend 1~3개.
- hsk.level은 1~6 정수.`;
}

// AI 응답 문자열에서 JSON만 안전하게 뽑아 파싱
function parseAIJson(raw) {
  if (!raw) throw new Error('AI 응답이 비어 있습니다.');
  let s = String(raw).trim();
  s = s.replace(/```json/gi, '').replace(/```/g, '').trim(); // 코드펜스 제거
  // 본문 중 첫 { ~ 마지막 } 만 추출 (앞뒤 잡설 방지)
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}

/* ─────────────────────────────────────────
   [3] API 호출 계층
   CONFIG.MODE 에 따라 요청 방식이 달라진다.
   세 경로 모두 "분석 결과 객체"를 반환하도록 통일한다.
   ───────────────────────────────────────── */
async function requestAnalysis(text, direction, situationId) {
  const prompt = buildPrompt(text, direction, situationId);

  if (CONFIG.MODE === 'backend') {
    return await viaBackend(text, direction, situationId);
  } else if (CONFIG.MODE === 'direct-anthropic') {
    return await viaAnthropic(prompt);
  } else if (CONFIG.MODE === 'direct-openai') {
    return await viaOpenAI(prompt);
  }
  throw new Error('알 수 없는 CONFIG.MODE 입니다: ' + CONFIG.MODE);
}

// (1) 권장: 내 서버리스 백엔드 호출 (키는 서버가 보관)
async function viaBackend(text, direction, situationId) {
  const res = await fetch(CONFIG.BACKEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, direction, situationId }),
  });
  if (!res.ok) {
    const detail = await safeText(res);
    throw new Error('백엔드 오류 (' + res.status + '): ' + detail);
  }
  const data = await res.json();
  // 백엔드가 이미 분석 객체를 주거나, raw 텍스트를 줄 수도 있으니 둘 다 대응
  if (data && data.natural) return data;
  if (data && typeof data.result === 'string') return parseAIJson(data.result);
  return parseAIJson(JSON.stringify(data));
}

// (2) 로컬 테스트: Claude(Anthropic) 직접 호출
async function viaAnthropic(prompt) {
  if (!APP.apiKey) throw new Error('API 키가 없습니다. 상단에 키를 입력해 주세요.');
  const res = await fetch(CONFIG.ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': APP.apiKey,
      'anthropic-version': '2023-06-01',
      // 브라우저 직접 호출 허용 헤더(테스트 전용)
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CONFIG.ANTHROPIC_MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error('Anthropic 오류 (' + res.status + '): ' + (await safeText(res)));
  const data = await res.json();
  const raw = (data.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('\n');
  return parseAIJson(raw);
}

// (3) 로컬 테스트: OpenAI 직접 호출
async function viaOpenAI(prompt) {
  if (!APP.apiKey) throw new Error('API 키가 없습니다. 상단에 키를 입력해 주세요.');
  const res = await fetch(CONFIG.OPENAI_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + APP.apiKey,
    },
    body: JSON.stringify({
      model: CONFIG.OPENAI_MODEL,
      max_tokens: CONFIG.MAX_TOKENS,
      messages: [
        { role: 'system', content: '너는 JSON만 출력하는 중국어 학습 도우미다.' },
        { role: 'user', content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error('OpenAI 오류 (' + res.status + '): ' + (await safeText(res)));
  const data = await res.json();
  const raw = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : '';
  return parseAIJson(raw);
}

// 응답 본문을 안전하게 텍스트로 (에러 메시지용)
async function safeText(res) {
  try { const t = await res.text(); return t.slice(0, 300); } catch (e) { return '(응답 읽기 실패)'; }
}

/* ─────────────────────────────────────────
   [5] 단계별 로딩 UI
   ───────────────────────────────────────── */
const STEPS = ['문장 분석 중…', '맥락 확인 중…', '표현 자연스러움 검사 중…', '학습 피드백 정리 중…'];
let stepTimer = null;

function startLoadingSteps() {
  const results = document.getElementById('results');
  let html = '<div class="analysis-steps"><div class="analysis-title">🔍 AI 친구가 분석하고 있어요</div>';
  STEPS.forEach((label, i) => {
    html += '<div class="step-row" id="step-' + i + '"><div class="step-icon">' + (i + 1) + '</div><div class="step-label">' + label + '</div></div>';
  });
  html += '</div>';
  results.innerHTML = html;

  // 실제 응답이 올 때까지 단계 표시를 순차 진행 (마지막 단계에서 대기)
  let i = 0;
  function tick() {
    if (i > 0) {
      const prev = document.getElementById('step-' + (i - 1));
      if (prev) { prev.classList.remove('step-row--active'); prev.classList.add('step-row--done'); const ic = prev.querySelector('.step-icon'); if (ic) ic.textContent = '✓'; }
    }
    if (i >= STEPS.length) return; // 마지막 단계는 응답 올 때까지 active 유지
    const cur = document.getElementById('step-' + i);
    if (cur) cur.classList.add('step-row--active');
    i++;
    if (i < STEPS.length) stepTimer = setTimeout(tick, 650);
  }
  tick();
}
function stopLoadingSteps() { if (stepTimer) { clearTimeout(stepTimer); stepTimer = null; } }

/* ─────────────────────────────────────────
   [7-a] 유틸: 발음 / 복사 / 토스트 / esc
   ───────────────────────────────────────── */
function speak(text) {
  if (!('speechSynthesis' in window)) { toast('이 브라우저는 발음 듣기를 지원하지 않아요'); return; }
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'zh-CN'; u.rate = 0.9; speechSynthesis.speak(u); }
  catch (e) { toast('발음 재생에 실패했어요'); }
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('복사했어요 📋')).catch(() => fallbackCopy(text));
  else fallbackCopy(text);
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('복사했어요 📋'); } catch (e) { toast('복사 실패'); }
  document.body.removeChild(ta);
}
let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('toast--show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('toast--show'), 1900);
}
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

/* 노트 저장 */
function isSaved(cn) { return APP.saved.some((x) => x.cn === cn); }
function toggleSave(item) {
  const idx = APP.saved.findIndex((x) => x.cn === item.cn);
  if (idx >= 0) { APP.saved.splice(idx, 1); toast('노트에서 제거했어요'); }
  else { APP.saved.unshift(item); toast('학습 노트에 저장했어요 ⭐'); }
  persist(); updateStats(); renderPanel(); renderNotes();
}
function bindActionButtons(scope) {
  scope.querySelectorAll('[data-act]').forEach((btn) => {
    if (btn.__bound) return; btn.__bound = true;
    btn.addEventListener('click', () => {
      const act = btn.dataset.act, cn = btn.dataset.cn || '';
      if (act === 'speak') speak(cn);
      else if (act === 'copy') copyText(cn);
      else if (act === 'save') { toggleSave({ cn, py: btn.dataset.py || '', ko: btn.dataset.ko || '' }); btn.classList.toggle('icon-btn--on', isSaved(cn)); }
    });
  });
}

/* ─────────────────────────────────────────
   [6] 결과 렌더링
   ───────────────────────────────────────── */
function highlight(desc) {
  return esc(desc).replace(/\[(.+?)\]/g, '<span class="hl">$1</span>');
}
function actionBtns(cn, py, ko, opts) {
  opts = opts || {}; let html = '';
  if (opts.speak !== false) html += '<button class="icon-btn" data-act="speak" data-cn="' + esc(cn) + '" title="발음 듣기">🔊</button>';
  if (opts.copy !== false) html += '<button class="icon-btn" data-act="copy" data-cn="' + esc(cn) + '" title="복사">📋</button>';
  if (opts.save) html += '<button class="icon-btn ' + (isSaved(cn) ? 'icon-btn--on' : '') + '" data-act="save" data-cn="' + esc(cn) + '" data-py="' + esc(py) + '" data-ko="' + esc(ko) + '" title="노트에 저장">⭐</button>';
  return html;
}
function card(icon, bg, title, body, actions) {
  return '<div class="result-card"><div class="result-card-head">' +
    '<div class="result-card-icon" style="background:' + bg + '">' + icon + '</div>' +
    '<div class="result-card-title">' + title + '</div>' +
    (actions ? '<div class="result-card-actions">' + actions + '</div>' : '') +
    '</div><div class="result-card-body">' + body + '</div></div>';
}

function renderResult(d) {
  // 응답 필드가 없을 수도 있으니 기본값으로 방어
  d = d || {};
  let html = '';

  // 1. 자연 번역
  let nat = '<div class="translation-main">' + esc(d.natural || '(번역 없음)') + '</div>';
  if (d.naturalPinyin) nat += '<div class="translation-pinyin">' + esc(d.naturalPinyin) + '</div>';
  html += card('✓', 'var(--mint)', '자연스러운 번역', nat, actionBtns(d.natural || '', d.naturalPinyin || '', '', { speak: true, copy: true, save: true }));

  // 2. 직역
  if (d.literal) html += card('↔', 'var(--beige)', '직역 (이렇게 말하면 어색해요)',
    '<div class="literal-text">' + esc(d.literal) + '</div>' + (d.literalNote ? '<div class="literal-note">💡 ' + esc(d.literalNote) + '</div>' : ''));

  // 3. 문법
  if (d.grammar) html += card('文', 'var(--blue-soft)', '핵심 문법 설명', '<div class="text-block"><p>' + esc(d.grammar) + '</p></div>');

  // 4. 오류 피드백
  if (Array.isArray(d.errors) && d.errors.length) {
    const items = d.errors.map((x) =>
      '<div class="error-item' + (x.isGood ? ' error-item--good' : '') + '">' +
      '<span class="error-warn-icon">' + (x.isGood ? '✅' : '⚠️') + '</span>' +
      '<div><div class="error-type">' + esc(x.type || '') + '</div>' +
      '<div class="error-desc">' + highlight(x.desc || '') + '</div></div></div>').join('');
    html += card('!', 'var(--warn-bg)', '학습자 오류 피드백', items);
  }

  // 5. 상황별 비교
  if (Array.isArray(d.situations) && d.situations.length) {
    const cards = d.situations.map((s) =>
      '<div class="situ-compare-card"><span class="situ-compare-tag">' + esc(s.tag || '') + '</span>' +
      '<div class="situ-compare-cn">' + esc(s.cn || '') + '</div>' +
      (s.py ? '<div class="situ-compare-py">' + esc(s.py) + '</div>' : '') +
      '<div class="result-card-actions">' + actionBtns(s.cn || '', s.py || '', '', { speak: true, copy: true, save: true }) + '</div></div>').join('');
    html += card('◑', 'var(--blue-soft)', '상황별 표현 비교', '<div class="situ-compare-grid">' + cards + '</div>');
  }

  // 6. 회화
  if (Array.isArray(d.conversation) && d.conversation.length) {
    const b = d.conversation.map((c) =>
      '<div class="conv-bubble"><div class="conv-bubble-text">' +
      '<span class="cn">' + esc(c.cn || '') + '</span> <span class="py">' + esc(c.py || '') + '</span>' +
      '<span class="ko">' + esc(c.ko || '') + '</span></div>' +
      '<button class="icon-btn" data-act="speak" data-cn="' + esc(c.cn || '') + '" title="발음 듣기">🔊</button></div>').join('');
    html += card('话', 'var(--accent-soft)', '실제 중국 회화 표현', b);
  }

  // 7. 문화
  if (d.culture) html += card('化', 'var(--card-soft)', '문화적 맥락 설명', '<div class="text-block"><p>' + esc(d.culture) + '</p></div>');

  // 8. HSK
  if (d.hsk) {
    const lv = Math.min(6, Math.max(1, Number(d.hsk.level) || 1));
    html += card('级', 'var(--accent-soft)', 'HSK 난이도',
      '<div class="hsk-wrap"><span class="hsk-badge">' + esc(d.hsk.label || ('HSK ' + lv + '급')) + '</span>' +
      '<div class="hsk-bar"><div class="hsk-fill" style="width:' + ((lv / 6) * 100).toFixed(0) + '%"></div></div>' +
      '<div class="hsk-desc">' + esc(d.hsk.desc || '') + '</div></div>');
  }

  // 9. 추천
  if (Array.isArray(d.recommend) && d.recommend.length) {
    const items = d.recommend.map((r) =>
      '<div class="reco-item"><span class="star">★</span>' +
      '<span><span class="cn">' + esc(r.cn || '') + '</span><span class="py">' + esc(r.py || '') + '</span>' +
      (r.ko ? '<div class="panel-reco-item" style="border:none;background:none;padding:0;margin-top:2px"><span class="ko">' + esc(r.ko) + '</span></div>' : '') +
      '</span>' + actionBtns(r.cn || '', r.py || '', r.ko || '', { speak: true, copy: false, save: true }) + '</div>').join('');
    html += card('☆', 'var(--mint)', '자연스러운 현지 표현 추천', '<div class="reco-list">' + items + '</div>');
  }

  const results = document.getElementById('results');
  results.innerHTML = html || '<div class="empty-state">결과를 표시할 수 없습니다.</div>';
  bindActionButtons(results);
}

// 오류 화면
function renderError(message) {
  const results = document.getElementById('results');
  results.innerHTML =
    '<div class="error-box"><div class="error-box-title">😅 분석에 실패했어요</div>' +
    '<div>' + esc(message) + '</div>' +
    '<button class="error-box-retry" id="retryBtn">다시 시도</button></div>';
  const r = document.getElementById('retryBtn');
  if (r) r.addEventListener('click', () => document.getElementById('submitBtn').click());
}

/* ─────────────────────────────────────────
   [7-b] 패널 / 노트 / Z세대 / 대시보드
   ───────────────────────────────────────── */
function updateStats() {
  document.getElementById('statLearned').textContent = APP.learnedCount;
  document.getElementById('statSaved').textContent = APP.saved.length;
  const today = Math.min(5, APP.recent.length);
  document.getElementById('progressFill').style.width = (today / 5) * 100 + '%';
  document.getElementById('progressText').textContent = today;
}
function renderTodayPhrase() {
  const p = TODAY_PHRASES[new Date().getDate() % TODAY_PHRASES.length];
  document.getElementById('todayCn').textContent = p.cn;
  document.getElementById('todayPy').textContent = p.py;
  document.getElementById('todayKo').textContent = p.ko;
}
function renderPanel() {
  const recentEl = document.getElementById('recentList');
  recentEl.innerHTML = APP.recent.length === 0
    ? '<div class="panel-empty">아직 기록이 없어요</div>'
    : APP.recent.slice(0, 5).map((r) =>
        '<div class="recent-item"><span class="cn">' + esc(r.cn) + '</span>' +
        '<span class="meta">' + esc(r.input) + ' · ' + esc(SITUATIONS[r.situ] ? SITUATIONS[r.situ].label : '') + '</span></div>').join('');

  const errEl = document.getElementById('commonErrors');
  const counts = {};
  APP.recent.forEach((r) => (r.errTypes || []).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
  const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3);
  errEl.innerHTML = sorted.length === 0
    ? '<div class="panel-empty">분석을 하면 자주 틀리는 유형이 모여요</div>'
    : sorted.map((t) => '<div class="common-item"><div class="ctype">⚠️ ' + esc(t) + '</div><div class="cdesc">' + counts[t] + '번 나타났어요</div></div>').join('');

  const recoEl = document.getElementById('recommendPanel');
  recoEl.innerHTML = [TODAY_PHRASES[0], TODAY_PHRASES[3], TODAY_PHRASES[4]].map((p) =>
    '<div class="panel-reco-item"><span class="cn">' + esc(p.cn) + '</span> <span class="py">' + esc(p.py) + '</span><div class="ko">' + esc(p.ko) + '</div></div>').join('');
}
function renderNotes() {
  const el = document.getElementById('notesList');
  if (APP.saved.length === 0) {
    el.innerHTML = '<div class="notes-empty"><span class="notes-empty-icon">📓</span>아직 저장한 표현이 없어요.<br/>학습하기에서 ⭐ 버튼으로 저장해 보세요.</div>'; return;
  }
  el.innerHTML = APP.saved.map((n) =>
    '<div class="note-card"><div class="note-card-cn">' + esc(n.cn) + '</div>' +
    (n.py ? '<div class="note-card-py">' + esc(n.py) + '</div>' : '') +
    (n.ko ? '<div class="note-card-ko">' + esc(n.ko) + '</div>' : '') +
    '<div class="note-card-foot">' +
      '<button class="icon-btn" data-act="speak" data-cn="' + esc(n.cn) + '">🔊</button>' +
      '<button class="icon-btn" data-act="copy" data-cn="' + esc(n.cn) + '">📋</button>' +
      '<button class="icon-btn icon-btn--on" data-act="save" data-cn="' + esc(n.cn) + '" data-py="' + esc(n.py || '') + '" data-ko="' + esc(n.ko || '') + '">⭐</button>' +
    '</div></div>').join('');
  bindActionButtons(el);
}
function renderSlang() {
  const el = document.getElementById('slangGrid');
  el.innerHTML = SLANG.map((s) =>
    '<div class="slang-card"><div class="slang-term">' + esc(s.term) + '</div>' +
    '<div class="slang-py">' + esc(s.py) + '</div><div class="slang-mean">' + esc(s.mean) + '</div>' +
    '<div class="slang-desc">' + esc(s.desc) + '</div><div class="slang-foot">' +
      '<button class="icon-btn" data-act="copy" data-cn="' + esc(s.term) + '">📋</button>' +
      '<button class="icon-btn ' + (isSaved(s.term) ? 'icon-btn--on' : '') + '" data-act="save" data-cn="' + esc(s.term) + '" data-py="' + esc(s.py) + '" data-ko="' + esc(s.mean) + '">⭐</button>' +
    '</div></div>').join('');
  bindActionButtons(el);
}

/* ─────────────────────────────────────────
   [8] 이벤트 & 초기화
   ───────────────────────────────────────── */
function applyTheme() {
  document.documentElement.setAttribute('data-theme', APP.theme);
  document.getElementById('themeToggle').textContent = APP.theme === 'dark' ? '☀️ 라이트모드' : '🌙 다크모드';
  document.getElementById('themeToggleMini').textContent = APP.theme === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() { APP.theme = APP.theme === 'dark' ? 'light' : 'dark'; persist(); applyTheme(); }
document.getElementById('themeToggle').addEventListener('click', toggleTheme);
document.getElementById('themeToggleMini').addEventListener('click', toggleTheme);

document.querySelectorAll('.direction-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.direction-btn').forEach((b) => b.classList.remove('direction-btn--active'));
    btn.classList.add('direction-btn--active');
    APP.direction = btn.dataset.dir;
    document.getElementById('inputText').placeholder = APP.direction === 'ko2cn'
      ? '예) 밥 먹었어? / 감사합니다 / 주말에 같이 영화 볼래?'
      : '예) 我吃饭了 / 谢谢 / 你周末有空吗？';
  });
});
document.querySelectorAll('.situation-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.situation-btn').forEach((b) => b.classList.remove('situation-btn--active'));
    btn.classList.add('situation-btn--active');
    APP.situation = btn.dataset.situ;
  });
});
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('nav-item--active'));
    btn.classList.add('nav-item--active');
    const view = btn.dataset.view;
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('view--active'));
    document.getElementById('view-' + view).classList.add('view--active');
    if (view === 'notes') renderNotes();
    if (view === 'culture') renderSlang();
    closeSidebar();
  });
});

// ── 제출: 실제 API 호출 ──
const submitBtn = document.getElementById('submitBtn');
submitBtn.addEventListener('click', async () => {
  const text = document.getElementById('inputText').value.trim();
  if (!text) { document.getElementById('inputText').focus(); toast('문장을 입력해 주세요'); return; }

  // direct 모드인데 키가 없으면 안내
  if (CONFIG.MODE !== 'backend' && !APP.apiKey) {
    toast('먼저 상단에 API 키를 입력해 주세요');
    const inp = document.getElementById('apiKeyInput'); if (inp) inp.focus();
    return;
  }

  APP.lastInput = text;
  submitBtn.disabled = true;
  submitBtn.textContent = '분석 중...';
  startLoadingSteps();

  try {
    const d = await requestAnalysis(text, APP.direction, APP.situation);
    stopLoadingSteps();
    renderResult(d);

    // 통계/기록 갱신
    APP.learnedCount += 1;
    APP.recent.unshift({
      input: text,
      cn: d && d.natural ? d.natural : '(결과)',
      situ: APP.situation,
      errTypes: (d && Array.isArray(d.errors) ? d.errors : []).filter((e) => !e.isGood).map((e) => e.type),
    });
    APP.recent = APP.recent.slice(0, 20);
    persist(); updateStats(); renderPanel();
  } catch (err) {
    stopLoadingSteps();
    console.error(err);
    renderError(err && err.message ? err.message : '알 수 없는 오류가 발생했습니다.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '학습 분석 받기';
  }
});

document.getElementById('inputText').addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submitBtn.click();
});

// ── API 키 배너 (direct 모드일 때만) ──
function setupApiBanner() {
  const banner = document.getElementById('apiBanner');
  if (CONFIG.MODE === 'backend') { banner.style.display = 'none'; return; }
  banner.style.display = 'block';
  const provider = CONFIG.MODE === 'direct-openai' ? 'OpenAI' : 'Claude';
  banner.querySelector('.api-banner-text').textContent =
    '🔑 로컬 테스트 모드(' + provider + ')입니다. API 키를 입력하면 시작할 수 있어요. (키는 저장되지 않고 메모리에만 보관됩니다)';
  document.getElementById('apiKeySave').addEventListener('click', () => {
    const v = document.getElementById('apiKeyInput').value.trim();
    if (!v) { toast('키를 입력해 주세요'); return; }
    APP.apiKey = v;
    banner.classList.add('api-banner--ok');
    banner.querySelector('.api-banner-text').textContent = '✅ API 키가 적용되었어요. 이제 문장을 분석할 수 있습니다.';
    toast('API 키 적용 완료');
  });
}

// ── 모바일 사이드바 ──
function openSidebar() { document.getElementById('sidebar').classList.add('sidebar--open'); document.getElementById('overlay').classList.add('overlay--show'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('sidebar--open'); document.getElementById('overlay').classList.remove('overlay--show'); }
document.getElementById('menuBtn').addEventListener('click', openSidebar);
document.getElementById('overlay').addEventListener('click', closeSidebar);

// ── 초기화 ──
applyTheme();
renderTodayPhrase();
updateStats();
renderPanel();
setupApiBanner();
