// ════════════════════════════════════════════════
// api/analyze.js  —  Vercel 서버리스 함수 (백엔드)
//
// 역할: 프론트(script.js)가 /api/analyze 로 POST 하면,
//       이 함수가 서버에서 안전하게 AI API를 호출하고
//       분석 결과(JSON)를 돌려준다.
//
// 핵심: API 키는 "서버 환경변수"에만 둔다.
//       → 브라우저/깃허브에 절대 노출되지 않는다.
//
// 배포 방법(Vercel):
//   1) 이 파일을 프로젝트의 api/ 폴더에 둔다.
//   2) Vercel 대시보드 → Settings → Environment Variables 에
//      ANTHROPIC_API_KEY = sk-ant-...  (또는 OPENAI_API_KEY) 추가
//   3) 배포하면 https://<도메인>/api/analyze 로 호출 가능
//
// (config.js 의 MODE 는 'backend', BACKEND_URL 은 '/api/analyze')
// ════════════════════════════════════════════════

export default async function handler(req, res) {
  // POST 만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST 요청만 허용됩니다.' });
  }

  try {
    const { text, direction, situationId } = req.body || {};
    if (!text || !String(text).trim()) {
      return res.status(400).json({ error: '문장(text)이 비어 있습니다.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: '서버에 ANTHROPIC_API_KEY 환경변수가 설정되지 않았습니다.' });
    }

    const prompt = buildPrompt(text, direction, situationId);

    // Claude API 호출
    const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const detail = await aiRes.text();
      return res.status(502).json({ error: 'AI API 오류(' + aiRes.status + '): ' + detail.slice(0, 300) });
    }

    const data = await aiRes.json();
    const raw = (data.content || []).map((b) => (b.type === 'text' ? b.text : '')).join('\n');

    // JSON 파싱 후 결과 객체를 그대로 반환
    const parsed = parseJson(raw);
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: '서버 처리 중 오류: ' + (err && err.message ? err.message : String(err)) });
  }
}

// ── 프롬프트 (프론트와 동일 스키마) ──
function buildPrompt(text, direction, situationId) {
  const dirText = direction === 'cn2ko' ? '중국어를 한국어로' : '한국어를 중국어로';
  const labels = { friend: '친구와 대화', school: '학교 발표', travel: '여행', sns: 'SNS', formal: '공식 표현' };
  const situ = labels[situationId] || '친구와 대화';

  return `너는 한국인 중국어 학습자를 돕는 친절한 중국어 선생님이다.
입력 문장을 ${dirText} 번역하고, 단순 번역을 넘어 학습 피드백을 제공한다.
한국어식 오류 교정, 직역 위험, 상황별 표현 차이, 문화 맥락, 문법 분석에 집중한다.

[입력 문장]
${text}

[사용 상황]
${situ}

아래 JSON 형식으로만 응답하라. 마크다운/설명/코드펜스 없이 순수 JSON만. 병음은 성조 부호를 정확히 표기.
{
  "natural": "자연 번역",
  "naturalPinyin": "중국어면 병음, 아니면 빈 문자열",
  "literal": "직역(어색한 표현)",
  "literalNote": "직역이 어색한 이유",
  "grammar": "핵심 문법 2~3문장",
  "errors": [{"type":"오류 유형","desc":"설명. 핵심 단어는 [대괄호]","isGood":false}],
  "situations": [{"tag":"친구","cn":"표현","py":"병음"},{"tag":"발표","cn":"","py":""},{"tag":"SNS","cn":"","py":""},{"tag":"공식","cn":"","py":""}],
  "conversation": [{"cn":"회화 표현","py":"병음","ko":"뜻"}],
  "culture": "문화 맥락 2~3문장",
  "hsk": {"level":1,"label":"HSK 1급","desc":"한 줄"},
  "recommend": [{"cn":"추천 표현","py":"병음","ko":"뜻"}]
}
오류가 없으면 errors에 {"type":"잘 쓴 표현","desc":"칭찬","isGood":true} 를 넣어라.`;
}

// ── 안전한 JSON 추출 ──
function parseJson(raw) {
  let s = String(raw || '').trim().replace(/```json/gi, '').replace(/```/g, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) s = s.slice(a, b + 1);
  return JSON.parse(s);
}
