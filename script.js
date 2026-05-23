/* ════════════════════════════════════════════════
   나만의 중국어 AI 친구 (고도화) - script.js

   구성
   [1] mock 데이터 (상황 / 예문 분석 / Z세대 표현 / 오늘의 중국어)
   [2] 저장소(Store) - localStorage 폴백 포함 상태 관리
   [3] 분석 엔진 (샘플 + 규칙 기반 한국어식 오류 탐지)
   [4] 단계별 분석 인터랙션
   [5] 결과 렌더링 (복사/즐겨찾기/발음 버튼 포함)
   [6] 학습 패널 / 대시보드 / 노트 / Z세대 뷰 렌더링
   [7] 발음(Web Speech) · 복사 · 토스트 유틸
   [8] 이벤트 바인딩 & 초기화
   ════════════════════════════════════════════════ */

/* ─────────────────────────────────────────
   [1] mock 데이터
   ───────────────────────────────────────── */
const SITUATIONS = {
  friend: { label: '친구와 대화', tone: '편하고 친근한 반말체' },
  school: { label: '학교 발표', tone: '정중하고 또렷한 발표체' },
  travel: { label: '여행', tone: '간단하고 실용적인 여행 회화체' },
  sns: { label: 'SNS', tone: '짧고 트렌디한 인터넷 말투' },
  formal: { label: '공식 표현', tone: '예의 바르고 격식 있는 표현' },
};

// 오늘의 중국어 (날짜 기반으로 매일 바뀜)
const TODAY_PHRASES = [
  { cn: '加油！', py: 'Jiāyóu!', ko: '힘내! / 파이팅!' },
  { cn: '慢慢来。', py: 'Màn man lái.', ko: '천천히 해. / 서두르지 마.' },
  { cn: '没关系。', py: 'Méi guānxi.', ko: '괜찮아. / 상관없어.' },
  { cn: '我请客！', py: 'Wǒ qǐngkè!', ko: '내가 쏠게!' },
  { cn: '太厉害了！', py: 'Tài lìhai le!', ko: '정말 대단하다!' },
  { cn: '改天再说。', py: 'Gǎitiān zài shuō.', ko: '다음에 다시 얘기하자.' },
  { cn: '随便你。', py: 'Suíbiàn nǐ.', ko: '네 마음대로 해.' },
];

// 중국 Z세대 / SNS 신조어
const SLANG = [
  { term: 'YYDS', py: 'yǒng yuǎn de shén', mean: '영원한 신 (永远的神)', desc: '최고를 칭찬할 때. "GOAT", "역대급"과 비슷해요. 좋아하는 아이돌·음식·게임에 다 씁니다.' },
  { term: '绝绝子', py: 'jué jué zǐ', mean: '완전 최고 / 너무 별로', desc: '극찬 또는 반어적 비난에 모두 쓰는 인터넷 유행어. 맥락으로 의미가 갈립니다.' },
  { term: '666', py: 'liù liù liù', mean: '잘한다! 멋지다!', desc: '"6"의 발음이 "牛(niú, 대단하다)"와 통해서, 게임·라이브에서 감탄으로 도배됩니다.' },
  { term: '永远滴神', py: 'yǒng yuǎn dī shén', mean: 'YYDS의 한자 표기', desc: 'YYDS를 한자로 그대로 쓴 형태. 댓글에서 자주 보입니다.' },
  { term: 'awsl', py: 'a wǒ sǐ le', mean: '아 나 죽었다 (너무 귀여워서)', desc: '"啊我死了"의 병음 약자. 너무 귀엽거나 감동해서 "심쿵사"할 때 씁니다.' },
  { term: 'xswl', py: 'xiào sǐ wǒ le', mean: '웃겨 죽겠다', desc: '"笑死我了"의 약자. 한국어 "ㅋㅋㅋ"와 거의 같은 느낌이에요.' },
  { term: '破防了', py: 'pò fáng le', mean: '멘탈 무너졌다', desc: '원래 게임 용어(방어 깨짐)에서 와서, 감정이 북받치거나 정곡을 찔렸을 때 씁니다.' },
  { term: '内卷', py: 'nèi juǎn', mean: '과도한 경쟁', desc: '한국의 "무한경쟁"과 비슷. 다들 너무 열심히 해서 같이 피곤해지는 상황을 말해요.' },
];

// 미리 작성한 예문 분석 데이터
const SAMPLE_DATA = {
  '감사합니다': {
    natural: '谢谢。', naturalPinyin: 'Xièxie.',
    literal: '感谢合니다 (직역 불가)',
    literalNote: '"감사합니다"의 정중함은 중국어에서 어미가 아니라 단어 선택(谢谢/非常感谢)으로 표현됩니다.',
    grammar: '"谢谢"는 가장 기본적인 감사 표현입니다. 더 정중하게는 "谢谢您", 격식 있게는 "非常感谢"를 씁니다.',
    errors: [
      { type: '존댓말 처리', desc: '한국어 "-습니다"를 직접 옮길 수 없습니다. 정중함은 [您]·[非常] 같은 어휘로 나타내세요.', isGood: false, hl: ['습니다'] },
    ],
    situations: [
      { tag: '친구', cn: '谢啦！', py: 'Xiè la!' },
      { tag: '발표', cn: '谢谢大家。', py: 'Xièxie dàjiā.' },
      { tag: 'SNS', cn: '蟹蟹～', py: 'Xièxie~' },
      { tag: '공식', cn: '非常感谢您。', py: 'Fēicháng gǎnxiè nín.' },
    ],
    conversation: [
      { cn: '谢谢你帮我！', py: 'Xièxie nǐ bāng wǒ!', ko: '도와줘서 고마워!' },
      { cn: '不客气。', py: 'Bú kèqi.', ko: '천만에. / 별말씀을.' },
    ],
    culture: '중국에서는 친한 사이에 "谢谢"를 너무 자주 쓰면 오히려 거리감을 준다고 느끼기도 합니다. 가족이나 아주 친한 친구 사이에서는 말보다 행동으로 고마움을 표현하는 경우가 많아요.',
    hsk: { level: 1, label: 'HSK 1급', desc: '가장 먼저 배우는 기초 감사 표현입니다.' },
    recommend: [
      { cn: '辛苦了！', py: 'Xīnkǔ le!', ko: '수고했어!' },
      { cn: '麻烦你了。', py: 'Máfan nǐ le.', ko: '번거롭게 해서 미안 (고맙다는 뉘앙스)' },
    ],
  },
  '밥 먹었어?': {
    natural: '你吃饭了吗？', naturalPinyin: 'Nǐ chī fàn le ma?',
    literal: '饭吃了吗？',
    literalNote: '주어(你)가 빠지면 어색합니다. 중국어 안부 인사에서는 주어를 넣는 게 자연스럽습니다.',
    grammar: '"了"는 완료, 문장 끝 "吗"는 의문을 만듭니다. "동사 + 了 + 吗?" 구조입니다.',
    errors: [
      { type: '한국어식 어순', desc: '한국어는 주어를 자주 생략하지만, 중국어에서는 [你]를 넣어야 자연스럽습니다.', isGood: false, hl: [] },
      { type: '문화적 맥락', desc: '"밥 먹었어?"는 실제 식사 여부보다 "잘 지내?"에 가까운 인사입니다.', isGood: false, hl: [] },
    ],
    situations: [
      { tag: '친구', cn: '吃了吗？', py: 'Chī le ma?' },
      { tag: '발표', cn: '大家用过餐了吗？', py: 'Dàjiā yòng guò cān le ma?' },
      { tag: 'SNS', cn: '干饭了没？', py: 'Gàn fàn le méi?' },
      { tag: '공식', cn: '您用过餐了吗？', py: 'Nín yòng guò cān le ma?' },
    ],
    conversation: [
      { cn: '吃了吗您？', py: 'Chī le ma nín?', ko: '식사하셨어요? (정겨운 인사)' },
      { cn: '还没呢，你呢？', py: 'Hái méi ne, nǐ ne?', ko: '아직요, 당신은요?' },
    ],
    culture: '"你吃饭了吗？"는 글자 그대로의 질문이 아니라 친근한 안부 인사입니다. 한국의 "잘 지내?"와 비슷해서, 정말 밥 먹었는지 답하지 않아도 됩니다.',
    hsk: { level: 1, label: 'HSK 1급', desc: '가장 기초적인 일상 인사 표현입니다.' },
    recommend: [
      { cn: '最近怎么样？', py: 'Zuìjìn zěnmeyàng?', ko: '요즘 어때?' },
    ],
  },
  '주말에 같이 영화 볼래?': {
    natural: '周末要不要一起看电影？', naturalPinyin: 'Zhōumò yào bú yào yìqǐ kàn diànyǐng?',
    literal: '周末一起电影看吗？',
    literalNote: '"영화 보다"를 "电影看"으로 옮기면 어순이 틀립니다. "看电影"(동사+목적어)이 맞습니다.',
    grammar: '"要不要"는 "~할래?"라는 권유. "一起"(함께)는 동사 앞에 옵니다. 어순은 "시간 + 要不要 + 一起 + 동사 + 목적어".',
    errors: [
      { type: '직역 위험', desc: '"电影看"처럼 목적어를 동사 앞에 두면 안 됩니다. 중국어는 [看电影] 순서입니다.', isGood: false, hl: ['영화 볼'] },
    ],
    situations: [
      { tag: '친구', cn: '周末一起看电影呗？', py: 'Zhōumò yìqǐ kàn diànyǐng bei?' },
      { tag: '발표', cn: '周末我们一起观影吧。', py: 'Zhōumò wǒmen yìqǐ guānyǐng ba.' },
      { tag: 'SNS', cn: '周末约个电影？', py: 'Zhōumò yuē ge diànyǐng?' },
      { tag: '공식', cn: '周末方便一起观影吗？', py: 'Zhōumò fāngbiàn yìqǐ guānyǐng ma?' },
    ],
    conversation: [
      { cn: '周末有空吗？一起看电影呗。', py: 'Zhōumò yǒu kòng ma? Yìqǐ kàn diànyǐng bei.', ko: '주말에 시간 있어? 같이 영화 보자.' },
      { cn: '好啊，看什么？', py: 'Hǎo a, kàn shénme?', ko: '좋아, 뭐 볼래?' },
    ],
    culture: '중국 젊은이들은 약속을 잡을 때 "约"(약속하다)을 자주 씁니다. "约个电影"처럼 쓰면 캐주얼하게 들립니다.',
    hsk: { level: 2, label: 'HSK 2급', desc: '권유와 일상 약속에 쓰는 기초 표현입니다.' },
    recommend: [
      { cn: '周末一起去玩吧！', py: 'Zhōumò yìqǐ qù wán ba!', ko: '주말에 같이 놀자!' },
    ],
  },
};

/* ─────────────────────────────────────────
   [2] 저장소 (Store)
   localStorage 가 막힌 환경(미리보기 등)에서도 동작하도록
   in-memory 폴백을 둔다.
   ───────────────────────────────────────── */
const Store = (() => {
  let mem = {}; // localStorage 불가 시 메모리 폴백
  let ok = true;
  try {
    const t = '__t__';
    window.localStorage.setItem(t, '1');
    window.localStorage.removeItem(t);
  } catch (e) { ok = false; }

  function read(key, def) {
    try {
      if (ok) {
        const v = window.localStorage.getItem(key);
        return v ? JSON.parse(v) : def;
      }
    } catch (e) {}
    return key in mem ? mem[key] : def;
  }
  function write(key, val) {
    try {
      if (ok) { window.localStorage.setItem(key, JSON.stringify(val)); return; }
    } catch (e) {}
    mem[key] = val;
  }
  return { read, write };
})();

// 앱 상태
const APP = {
  direction: 'ko2cn',
  situation: 'friend',
  lastResult: null,
  saved: Store.read('caf_saved', []),      // 저장한 표현(노트)
  recent: Store.read('caf_recent', []),    // 최근 번역 기록
  learnedCount: Store.read('caf_learned', 0), // 누적 학습 수
  theme: Store.read('caf_theme', 'light'),
};

function persist() {
  Store.write('caf_saved', APP.saved);
  Store.write('caf_recent', APP.recent);
  Store.write('caf_learned', APP.learnedCount);
  Store.write('caf_theme', APP.theme);
}

/* ─────────────────────────────────────────
   [3] 분석 엔진
   ───────────────────────────────────────── */
function detectLanguage(text) {
  if (/[\uac00-\ud7a3]/.test(text)) return 'ko';
  if (/[\u4e00-\u9fff]/.test(text)) return 'cn';
  return 'ko';
}

const KO_STYLE_RULES = [
  { test: (t) => /(을|를)\s*(보|먹|마시|하|사|읽)/.test(t), type: '직역 위험',
    desc: '한국어 "목적어 + 동사" 어순을 그대로 옮기면 어색합니다. 중국어는 "동사 + 목적어" 순서입니다. (예: 看电影)' },
  { test: (t) => /너무|진짜|완전|엄청/.test(t), type: '부자연스러운 강조',
    desc: '강조를 매번 "很"으로만 옮기면 단조롭습니다. "太…了 / 非常 / 特别" 등으로 다양하게 표현하세요.' },
  { test: (t) => /(요|습니다|합니다|십시오)$/.test(t.trim()), type: '존댓말 처리',
    desc: '한국어 존댓말은 중국어에서 어미가 아니라 "您 / 请 / 정중한 어휘"로 표현됩니다.' },
];

function ruleBasedAnalysis(text, situationId) {
  const lang = detectLanguage(text);
  const situ = SITUATIONS[situationId] || SITUATIONS.friend;
  const errors = [];
  if (lang === 'ko') {
    KO_STYLE_RULES.forEach((r) => { if (r.test(text)) errors.push({ type: r.type, desc: r.desc, isGood: false, hl: [] }); });
  }
  if (errors.length === 0) {
    errors.push({ type: '잘 쓴 표현', desc: '눈에 띄는 한국어식 오류가 보이지 않아요. 아래 상황별 표현으로 더 자연스럽게 다듬어 보세요!', isGood: true, hl: [] });
  }
  return {
    natural: lang === 'ko' ? '（예시 번역）这句话可以这样说。' : '（예시 번역）이 문장은 이렇게 표현할 수 있어요.',
    naturalPinyin: lang === 'ko' ? 'Zhè jù huà kěyǐ zhèyàng shuō.' : '',
    literal: lang === 'ko' ? '직역하면 어순·조사가 어색해질 수 있습니다.' : '글자 그대로 옮기면 한국어 어순과 맞지 않을 수 있습니다.',
    literalNote: '직역은 단어를 1:1로 바꾸기 때문에 문장의 맥락과 자연스러움을 놓치기 쉽습니다.',
    grammar: '선택한 상황은 "' + situ.label + '"(' + situ.tone + ')입니다. 같은 뜻이라도 상황에 따라 어휘와 말투를 바꿔야 합니다. 중국어 기본 어순은 "주어 + 동사 + 목적어"입니다.',
    errors,
    situations: [
      { tag: '친구', cn: '（편한 말투）', py: '' },
      { tag: '발표', cn: '（또렷한 발표체）', py: '' },
      { tag: 'SNS', cn: '（짧은 인터넷 말투）', py: '' },
      { tag: '공식', cn: '（您/请 정중체）', py: '' },
    ],
    conversation: [
      { cn: '这个用中文怎么说？', py: 'Zhège yòng zhōngwén zěnme shuō?', ko: '이거 중국어로 어떻게 말해요? (만능 표현)' },
    ],
    culture: '중국어는 같은 의미라도 관계와 상황에 따라 표현이 크게 달라집니다. 친구에게 쓰는 말투와 공식 자리의 말투를 구분하는 것이 자연스러운 회화의 핵심입니다.',
    hsk: { level: 2, label: 'HSK 2급', desc: '문장 구성에 따라 난이도가 달라질 수 있습니다.' },
    recommend: [{ cn: '请帮我看看对不对。', py: 'Qǐng bāng wǒ kànkan duì bú duì.', ko: '맞는지 좀 봐주세요.' }],
  };
}

function getAnalysis(text, situationId) {
  const key = text.trim();
  if (SAMPLE_DATA[key]) {
    const d = SAMPLE_DATA[key];
    return Object.assign({}, d, { recommend: d.recommend || [] });
  }
  return ruleBasedAnalysis(text, situationId);
}

/* ─────────────────────────────────────────
   [4] 단계별 분석 인터랙션
   ───────────────────────────────────────── */
const ANALYSIS_STEPS = ['문장 분석 중…', '맥락 확인 중…', '표현 자연스러움 검사 중…', '학습 피드백 정리 중…'];

function runAnalysisWithSteps(text, situationId) {
  return new Promise((resolve) => {
    const results = document.getElementById('results');
    // 단계 UI 그리기
    let stepsHtml = '<div class="analysis-steps"><div class="analysis-title">🔍 AI 친구가 분석하고 있어요</div>';
    ANALYSIS_STEPS.forEach((label, i) => {
      stepsHtml += '<div class="step-row" id="step-' + i + '"><div class="step-icon">' + (i + 1) + '</div><div class="step-label">' + label + '</div></div>';
    });
    stepsHtml += '</div>';
    results.innerHTML = stepsHtml;

    let i = 0;
    function next() {
      if (i > 0) {
        const prev = document.getElementById('step-' + (i - 1));
        if (prev) { prev.classList.remove('step-row--active'); prev.classList.add('step-row--done'); prev.querySelector('.step-icon').textContent = '✓'; }
      }
      if (i >= ANALYSIS_STEPS.length) {
        resolve(getAnalysis(text, situationId));
        return;
      }
      const cur = document.getElementById('step-' + i);
      if (cur) cur.classList.add('step-row--active');
      i++;
      setTimeout(next, 550);
    }
    next();
  });
}

/* ─────────────────────────────────────────
   [7] 유틸: 발음 / 복사 / 토스트  (먼저 정의)
   ───────────────────────────────────────── */
function speak(text) {
  if (!('speechSynthesis' in window)) { toast('이 브라우저는 발음 듣기를 지원하지 않아요'); return; }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN';
    u.rate = 0.9;
    window.speechSynthesis.speak(u);
  } catch (e) { toast('발음 재생에 실패했어요'); }
}

function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast('복사했어요 📋')).catch(() => fallbackCopy(text));
  } else { fallbackCopy(text); }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('복사했어요 📋'); } catch (e) { toast('복사에 실패했어요'); }
  document.body.removeChild(ta);
}

let toastTimer = null;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('toast--show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('toast--show'), 1900);
}

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* 저장(노트) 관련 헬퍼 */
function isSaved(cn) { return APP.saved.some((x) => x.cn === cn); }
function toggleSave(item) {
  const idx = APP.saved.findIndex((x) => x.cn === item.cn);
  if (idx >= 0) { APP.saved.splice(idx, 1); toast('노트에서 제거했어요'); }
  else { APP.saved.unshift(item); toast('학습 노트에 저장했어요 ⭐'); }
  persist();
  updateStats();
  renderPanel();
  renderNotes();
}

/* 인라인 버튼들이 호출하는 전역 핸들러 (data-속성으로 안전하게 위임) */
function bindActionButtons(scope) {
  scope.querySelectorAll('[data-act]').forEach((btn) => {
    if (btn.__bound) return;
    btn.__bound = true;
    btn.addEventListener('click', () => {
      const act = btn.dataset.act;
      const cn = btn.dataset.cn || '';
      if (act === 'speak') speak(cn);
      else if (act === 'copy') copyText(cn);
      else if (act === 'save') {
        toggleSave({ cn: cn, py: btn.dataset.py || '', ko: btn.dataset.ko || '' });
        btn.classList.toggle('icon-btn--on', isSaved(cn));
      }
    });
  });
}

/* ─────────────────────────────────────────
   [5] 결과 렌더링
   ───────────────────────────────────────── */
// 오류 설명에서 [단어] 또는 hl 배열 단어를 노란 하이라이트로
function highlight(desc, hlWords) {
  let out = esc(desc).replace(/\[(.+?)\]/g, '<span class="hl">$1</span>');
  (hlWords || []).forEach((w) => {
    if (!w) return;
    out = out.replace(new RegExp('(' + esc(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')'), '<span class="hl">$1</span>');
  });
  return out;
}

// 작은 액션 버튼 묶음 (발음/복사/저장)
function actionBtns(cn, py, ko, opts) {
  opts = opts || {};
  let html = '';
  if (opts.speak !== false) html += '<button class="icon-btn" data-act="speak" data-cn="' + esc(cn) + '" title="발음 듣기">🔊</button>';
  if (opts.copy !== false) html += '<button class="icon-btn" data-act="copy" data-cn="' + esc(cn) + '" title="복사">📋</button>';
  if (opts.save) html += '<button class="icon-btn ' + (isSaved(cn) ? 'icon-btn--on' : '') + '" data-act="save" data-cn="' + esc(cn) + '" data-py="' + esc(py) + '" data-ko="' + esc(ko) + '" title="노트에 저장">⭐</button>';
  return html;
}

function card(icon, bg, title, bodyHtml, actionsHtml) {
  return '<div class="result-card">' +
    '<div class="result-card-head">' +
      '<div class="result-card-icon" style="background:' + bg + '">' + icon + '</div>' +
      '<div class="result-card-title">' + title + '</div>' +
      (actionsHtml ? '<div class="result-card-actions">' + actionsHtml + '</div>' : '') +
    '</div>' +
    '<div class="result-card-body">' + bodyHtml + '</div>' +
  '</div>';
}

function renderResult(d) {
  let html = '';

  // 1. 자연 번역 (+발음/복사/저장)
  let natBody = '<div class="translation-main">' + esc(d.natural) + '</div>';
  if (d.naturalPinyin) natBody += '<div class="translation-pinyin">' + esc(d.naturalPinyin) + '</div>';
  html += card('✓', 'var(--mint)', '자연스러운 번역', natBody,
    actionBtns(d.natural, d.naturalPinyin, '', { speak: true, copy: true, save: true }));

  // 2. 직역
  html += card('↔', 'var(--beige)', '직역 (이렇게 말하면 어색해요)',
    '<div class="literal-text">' + esc(d.literal) + '</div><div class="literal-note">💡 ' + esc(d.literalNote) + '</div>');

  // 3. 핵심 문법
  html += card('文', 'var(--blue-soft)', '핵심 문법 설명', '<div class="text-block"><p>' + esc(d.grammar) + '</p></div>');

  // 4. 오류 피드백 (노란 하이라이트 + 경고 아이콘)
  if (d.errors && d.errors.length) {
    const items = d.errors.map((x) =>
      '<div class="error-item' + (x.isGood ? ' error-item--good' : '') + '">' +
        '<span class="error-warn-icon">' + (x.isGood ? '✅' : '⚠️') + '</span>' +
        '<div><div class="error-type">' + esc(x.type) + '</div>' +
        '<div class="error-desc">' + highlight(x.desc, x.hl) + '</div></div>' +
      '</div>').join('');
    html += card('!', 'var(--warn-bg)', '학습자 오류 피드백', items);
  }

  // 5. 상황별 표현 비교 (카드 그리드)
  if (d.situations && d.situations.length) {
    const cards = d.situations.map((s) =>
      '<div class="situ-compare-card">' +
        '<span class="situ-compare-tag">' + esc(s.tag) + '</span>' +
        '<div class="situ-compare-cn">' + esc(s.cn) + '</div>' +
        (s.py ? '<div class="situ-compare-py">' + esc(s.py) + '</div>' : '') +
        '<div class="result-card-actions">' + actionBtns(s.cn, s.py, '', { speak: true, copy: true, save: true }) + '</div>' +
      '</div>').join('');
    html += card('◑', 'var(--blue-soft)', '상황별 표현 비교', '<div class="situ-compare-grid">' + cards + '</div>');
  }

  // 6. 실제 회화 표현
  if (d.conversation && d.conversation.length) {
    const bubbles = d.conversation.map((c) =>
      '<div class="conv-bubble"><div class="conv-bubble-text">' +
        '<span class="cn">' + esc(c.cn) + '</span> <span class="py">' + esc(c.py) + '</span>' +
        '<span class="ko">' + esc(c.ko) + '</span></div>' +
        '<button class="icon-btn" data-act="speak" data-cn="' + esc(c.cn) + '" title="발음 듣기">🔊</button>' +
      '</div>').join('');
    html += card('话', 'var(--accent-soft)', '실제 중국 회화 표현', bubbles);
  }

  // 7. 문화적 맥락
  html += card('化', 'var(--card-soft)', '문화적 맥락 설명', '<div class="text-block"><p>' + esc(d.culture) + '</p></div>');

  // 8. HSK 난이도
  if (d.hsk) {
    const lv = Math.min(6, Math.max(1, d.hsk.level || 1));
    const width = ((lv / 6) * 100).toFixed(0) + '%';
    html += card('级', 'var(--accent-soft)', 'HSK 난이도',
      '<div class="hsk-wrap"><span class="hsk-badge">' + esc(d.hsk.label || ('HSK ' + lv + '급')) + '</span>' +
      '<div class="hsk-bar"><div class="hsk-fill" style="width:' + width + '"></div></div>' +
      '<div class="hsk-desc">' + esc(d.hsk.desc || '') + '</div></div>');
  }

  // 9. 추천 표현
  if (d.recommend && d.recommend.length) {
    const items = d.recommend.map((r) =>
      '<div class="reco-item"><span class="star">★</span>' +
        '<span><span class="cn">' + esc(r.cn) + '</span><span class="py">' + esc(r.py) + '</span>' +
        (r.ko ? '<div class="panel-reco-item" style="border:none;background:none;padding:0;margin-top:2px"><span class="ko">' + esc(r.ko) + '</span></div>' : '') +
        '</span>' + actionBtns(r.cn, r.py, r.ko, { speak: true, copy: false, save: true }) +
      '</div>').join('');
    html += card('☆', 'var(--mint)', '자연스러운 현지 표현 추천', '<div class="reco-list">' + items + '</div>');
  }

  const results = document.getElementById('results');
  results.innerHTML = html;
  bindActionButtons(results);
}

/* ─────────────────────────────────────────
   [6] 패널 / 대시보드 / 노트 / Z세대 렌더링
   ───────────────────────────────────────── */
function updateStats() {
  document.getElementById('statLearned').textContent = APP.learnedCount;
  document.getElementById('statSaved').textContent = APP.saved.length;
  // 진행률: 오늘 학습한 문장 수(최근 기록 기준, 최대 5)
  const todayCount = Math.min(5, APP.recent.length);
  const pct = (todayCount / 5) * 100;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressText').textContent = todayCount;
}

function renderTodayPhrase() {
  const idx = new Date().getDate() % TODAY_PHRASES.length;
  const p = TODAY_PHRASES[idx];
  document.getElementById('todayCn').textContent = p.cn;
  document.getElementById('todayPy').textContent = p.py;
  document.getElementById('todayKo').textContent = p.ko;
}

function renderPanel() {
  // 최근 번역 기록
  const recentEl = document.getElementById('recentList');
  if (APP.recent.length === 0) {
    recentEl.innerHTML = '<div class="panel-empty">아직 기록이 없어요</div>';
  } else {
    recentEl.innerHTML = APP.recent.slice(0, 5).map((r) =>
      '<div class="recent-item"><span class="cn">' + esc(r.cn) + '</span>' +
      '<span class="meta">' + esc(r.input) + ' · ' + esc(SITUATIONS[r.situ] ? SITUATIONS[r.situ].label : '') + '</span></div>').join('');
  }

  // 자주 틀리는 표현 (최근 기록에서 모은 오류 유형 빈도)
  const errEl = document.getElementById('commonErrors');
  const counts = {};
  APP.recent.forEach((r) => (r.errTypes || []).forEach((t) => { counts[t] = (counts[t] || 0) + 1; }));
  const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 3);
  if (sorted.length === 0) {
    errEl.innerHTML = '<div class="panel-empty">분석을 하면 자주 틀리는 유형이 모여요</div>';
  } else {
    errEl.innerHTML = sorted.map((t) =>
      '<div class="common-item"><div class="ctype">⚠️ ' + esc(t) + '</div>' +
      '<div class="cdesc">' + counts[t] + '번 나타났어요</div></div>').join('');
  }

  // 추천 중국어 표현 (오늘의 표현 + 슬랭 일부)
  const recoEl = document.getElementById('recommendPanel');
  const picks = [TODAY_PHRASES[0], TODAY_PHRASES[3], TODAY_PHRASES[4]];
  recoEl.innerHTML = picks.map((p) =>
    '<div class="panel-reco-item"><span class="cn">' + esc(p.cn) + '</span> ' +
    '<span class="py">' + esc(p.py) + '</span><div class="ko">' + esc(p.ko) + '</div></div>').join('');
}

function renderNotes() {
  const el = document.getElementById('notesList');
  if (APP.saved.length === 0) {
    el.innerHTML = '<div class="notes-empty"><span class="notes-empty-icon">📓</span>아직 저장한 표현이 없어요.<br/>학습하기에서 ⭐ 버튼으로 표현을 저장해 보세요.</div>';
    return;
  }
  el.innerHTML = APP.saved.map((n) =>
    '<div class="note-card">' +
      '<div class="note-card-cn">' + esc(n.cn) + '</div>' +
      (n.py ? '<div class="note-card-py">' + esc(n.py) + '</div>' : '') +
      (n.ko ? '<div class="note-card-ko">' + esc(n.ko) + '</div>' : '') +
      '<div class="note-card-foot">' +
        '<button class="icon-btn" data-act="speak" data-cn="' + esc(n.cn) + '" title="발음">🔊</button>' +
        '<button class="icon-btn" data-act="copy" data-cn="' + esc(n.cn) + '" title="복사">📋</button>' +
        '<button class="icon-btn icon-btn--on" data-act="save" data-cn="' + esc(n.cn) + '" data-py="' + esc(n.py || '') + '" data-ko="' + esc(n.ko || '') + '" title="저장 해제">⭐</button>' +
      '</div>' +
    '</div>').join('');
  bindActionButtons(el);
}

function renderSlang() {
  const el = document.getElementById('slangGrid');
  el.innerHTML = SLANG.map((s) =>
    '<div class="slang-card">' +
      '<div class="slang-term">' + esc(s.term) + '</div>' +
      '<div class="slang-py">' + esc(s.py) + '</div>' +
      '<div class="slang-mean">' + esc(s.mean) + '</div>' +
      '<div class="slang-desc">' + esc(s.desc) + '</div>' +
      '<div class="slang-foot">' +
        '<button class="icon-btn" data-act="copy" data-cn="' + esc(s.term) + '" title="복사">📋</button>' +
        '<button class="icon-btn ' + (isSaved(s.term) ? 'icon-btn--on' : '') + '" data-act="save" data-cn="' + esc(s.term) + '" data-py="' + esc(s.py) + '" data-ko="' + esc(s.mean) + '" title="노트에 저장">⭐</button>' +
      '</div>' +
    '</div>').join('');
  bindActionButtons(el);
}

/* ─────────────────────────────────────────
   [8] 이벤트 바인딩 & 초기화
   ───────────────────────────────────────── */
// 테마 적용
function applyTheme() {
  document.documentElement.setAttribute('data-theme', APP.theme);
  const label = APP.theme === 'dark' ? '☀️ 라이트모드' : '🌙 다크모드';
  document.getElementById('themeToggle').textContent = label;
  document.getElementById('themeToggleMini').textContent = APP.theme === 'dark' ? '☀️' : '🌙';
}
function toggleTheme() { APP.theme = APP.theme === 'dark' ? 'light' : 'dark'; persist(); applyTheme(); }
document.getElementById('themeToggle').addEventListener('click', toggleTheme);
document.getElementById('themeToggleMini').addEventListener('click', toggleTheme);

// 방향 토글
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

// 상황 선택
document.querySelectorAll('.situation-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.situation-btn').forEach((b) => b.classList.remove('situation-btn--active'));
    btn.classList.add('situation-btn--active');
    APP.situation = btn.dataset.situ;
  });
});

// 뷰 전환 (학습 / 노트 / Z세대)
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

// 제출
const submitBtn = document.getElementById('submitBtn');
submitBtn.addEventListener('click', async () => {
  const text = document.getElementById('inputText').value.trim();
  if (!text) { document.getElementById('inputText').focus(); toast('문장을 입력해 주세요'); return; }

  submitBtn.disabled = true;
  submitBtn.textContent = '분석 중...';
  try {
    const d = await runAnalysisWithSteps(text, APP.situation);
    APP.lastResult = d;
    renderResult(d);

    // 기록/통계 업데이트
    APP.learnedCount += 1;
    APP.recent.unshift({
      input: text,
      cn: d.natural,
      situ: APP.situation,
      errTypes: (d.errors || []).filter((e) => !e.isGood).map((e) => e.type),
    });
    APP.recent = APP.recent.slice(0, 20);
    persist();
    updateStats();
    renderPanel();
  } catch (e) {
    console.error(e);
    document.getElementById('results').innerHTML = '<div class="empty-state"><span class="empty-state-icon">😅</span>분석 중 문제가 생겼어요. 다시 시도해 주세요.</div>';
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = '학습 분석 받기';
  }
});

// Ctrl/Cmd + Enter 제출
document.getElementById('inputText').addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submitBtn.click();
});

// 모바일 사이드바
function openSidebar() { document.getElementById('sidebar').classList.add('sidebar--open'); document.getElementById('overlay').classList.add('overlay--show'); }
function closeSidebar() { document.getElementById('sidebar').classList.remove('sidebar--open'); document.getElementById('overlay').classList.remove('overlay--show'); }
document.getElementById('menuBtn').addEventListener('click', openSidebar);
document.getElementById('overlay').addEventListener('click', closeSidebar);

// ── 초기화 ──
applyTheme();
renderTodayPhrase();
updateStats();
renderPanel();
