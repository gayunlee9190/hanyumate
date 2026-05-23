/* ════════════════════════════════════════════════
   config.js  —  API 연결 설정
   ════════════════════════════════════════════════

   이 파일에서 "어디로 요청을 보낼지"만 설정합니다.
   ⚠️ 중요: API 키를 이 파일에 직접 적지 마세요.
            GitHub에 올리는 순간 키가 그대로 노출됩니다.

   동작 모드(MODE)는 3가지:

   1) 'backend'  (권장 · 실제 배포용)
        - 직접 만든 서버리스 함수(/api/analyze)를 호출합니다.
        - API 키는 서버 환경변수에 안전하게 보관됩니다.
        - 브라우저에 키가 절대 노출되지 않고 CORS 문제도 없습니다.
        - 같이 제공한 api/analyze.js 파일을 Vercel 등에 배포하세요.

   2) 'direct-anthropic' (로컬 테스트용 · 배포 금지)
        - 브라우저에서 Claude API를 직접 호출합니다.
        - 키는 화면에서 입력받아 "메모리에만" 보관합니다(저장 안 함).
        - 실제 서비스/배포에는 절대 쓰지 마세요(키 노출 위험).

   3) 'direct-openai' (로컬 테스트용 · 배포 금지)
        - 위와 동일하나 OpenAI API를 사용합니다.
   ──────────────────────────────────────────────── */

const CONFIG = {
  // 사용할 모드를 선택하세요.
  MODE: 'backend',

  // [backend 모드] 내가 배포한 서버리스 함수 경로
  BACKEND_URL: '/api/analyze',

  // [direct-anthropic 모드] 설정
  ANTHROPIC_URL: 'https://api.anthropic.com/v1/messages',
  ANTHROPIC_MODEL: 'claude-sonnet-4-20250514',

  // [direct-openai 모드] 설정
  OPENAI_URL: 'https://api.openai.com/v1/chat/completions',
  OPENAI_MODEL: 'gpt-4o-mini',

  // 공통 설정
  MAX_TOKENS: 1500,
};
