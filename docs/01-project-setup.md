# 01. 프로젝트 생성 지침

이 문서는 **어떤 파일을 만들고, 어떻게 설치하고 실행할지** 정한다. 제품 범위는 [PRD](../PRD.md), 작업 방식은 [AGENTS](../AGENTS.md)를 따른다.

## 1. 확정 구조

```text
sentiment-service/
├─ AGENTS.md
├─ PRD.md
├─ docs/                         # 이 문서 포함 6개 지침
├─ public/                       # 브라우저에 공개되는 파일만
│  ├─ index.html
│  ├─ css/styles.css
│  └─ js/
│     ├─ app.js                  # 이벤트와 화면 상태
│     ├─ api.js                  # fetch·시간 초과·응답 검증
│     ├─ ui.js                   # 안전한 DOM 업데이트
│     └─ validation.js           # 브라우저 입력 검증
├─ api/analyze.js                # Vercel Node 함수 진입점
├─ src/server/
│  ├─ analyze-handler.js         # 요청 처리 순서와 오류 변환
│  ├─ validation.js              # 서버 입력·출력 검증
│  ├─ openai-client.js           # AI 요청
│  ├─ sentiment-prompt.js        # 고정 지시문·출력 스키마
│  ├─ supabase-client.js         # 서버 전용 DB 연결
│  ├─ analysis-repository.js     # 허용된 운영 필드만 저장
│  └─ errors.js                 # 오류 코드·사용자용 문구
├─ supabase/migrations/
│  └─ 001_create_analysis_events.sql
├─ tests/
│  ├─ unit/                     # node:test
│  ├─ e2e/                      # Playwright
│  └─ fixtures/                 # 가짜 응답·고정 평가 문장
├─ artifacts/                   # 구현 후 검사 결과·화면 캡처
├─ .env.example                 # 변수 이름과 가짜 예시만
├─ .env.local                   # 실제 로컬 값, Git 제외
├─ .gitignore
├─ package.json
├─ package-lock.json
├─ playwright.config.js
└─ vercel.json
```

`public/` 안에 서버 코드·환경변수·문서·SQL을 넣지 않는다. 구현 과정에서 필요한 작은 보조 파일을 같은 책임 영역에 추가할 수 있지만 새로운 프레임워크나 별도 서비스를 도입하지 않는다.

## 2. 요청이 흐르는 방식

```text
브라우저 HTML/CSS/JS
  └─ POST /api/analyze { text }
       └─ Node.js: 입력 검사
            └─ OpenAI: 감성·신뢰도·이유 생성
                 └─ Node.js: 결과 검사
                      ├─ Supabase: 제한된 운영 정보 저장
                      └─ 브라우저: JSON 결과 표시
```

Vercel Function은 요청이 왔을 때 서버 코드를 실행하는 방식이다. 별도 서버 컴퓨터나 항상 켜 두는 Express 프로세스가 필요하지 않다. 같은 도메인에서 화면과 API를 제공하므로 브라우저에는 API 도메인 환경변수를 만들지 않는다.

## 3. 런타임과 의존성

- Node.js **24.x**, npm, JavaScript ES Modules를 사용한다.
- 운영 의존성은 `openai`, `@supabase/supabase-js` 두 개다. JSON Schema와 값 검증은 작은 순수 JavaScript 함수로 구현한다.
- 개발 의존성은 `vercel`, `@playwright/test`다. 단위 테스트는 Node 내장 `node:test`와 `node:assert/strict`를 사용한다.
- 새 프로젝트의 첫 설치는 아래 명령으로 실제 버전을 결정한다. 설치된 정확한 버전은 `package.json`과 lockfile에 기록한다. 존재하지 않는 최신 버전 번호를 추측해서 적지 않는다.

```sh
npm init -y
npm install --save-exact openai @supabase/supabase-js
npm install --save-dev --save-exact vercel @playwright/test
npx playwright install chromium
```

설치 뒤 `package.json`에 다음 필드를 병합한다. 설치로 생성된 `dependencies`와 `devDependencies`는 유지한다.

```json
{
  "name": "maeumgyeol-sentiment",
  "private": true,
  "type": "module",
  "engines": { "node": "24.x" },
  "scripts": {
    "dev": "vercel dev --local --listen 3000",
    "test": "node --test tests/unit/*.test.js",
    "test:e2e": "playwright test"
  }
}
```

HTML에서 `<script type="module" src="/js/app.js"></script>`로 시작한다. 별도 번들러·빌드 단계는 없다. Node.js 지원 및 ES Modules 방식은 [Vercel Node 런타임](https://vercel.com/docs/functions/runtimes/node-js)과 [지원 버전 문서](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)를 기준으로 한다.

## 4. Vercel 설정

프로젝트 루트의 `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "outputDirectory": "public",
  "buildCommand": "",
  "functions": {
    "api/analyze.js": { "maxDuration": 30 }
  }
}
```

- Dashboard의 Framework Preset은 **Other**, Output Directory는 **public**, Build Command는 비움으로 맞춘다.
- 루트 `api/analyze.js`가 `/api/analyze` 경로다. `public/api/`로 옮기지 않는다.
- 모든 URL을 `index.html`로 보내는 SPA rewrite를 추가하지 않는다. API 404와 HTML 응답 혼선을 방지한다.
- `devCommand`에 `npm run dev`나 `vercel dev`를 설정하면 재귀 실행될 수 있으므로 지정하지 않는다. Dashboard Development Command에도 같은 명령을 넣지 않는다.
- API 함수는 **Web 표준 Request/Response 방식**으로 통일한다. 기존 `req/res` 방식과 섞지 않는다.

```js
// api/analyze.js의 인터페이스 예시. 실제 업무 로직은 handler로 분리한다.
import { createAnalyzeHandler } from '../src/server/analyze-handler.js';
import { productionDependencies } from '../src/server/production-dependencies.js';

export default {
  fetch: createAnalyzeHandler(productionDependencies)
};
```

위 `production-dependencies.js`는 OpenAI·DB 어댑터와 환경변수를 연결하는 보조 파일로 구현 시 추가한다. `createAnalyzeHandler(deps)`는 `async (request) => Response`를 반환한다. SDK 클라이언트를 만들 때 환경변수가 없으면 모듈 import 단계에서 죽지 않도록 지연 초기화한다. 요청 시 04 문서의 `CONFIGURATION_ERROR`로 변환한다.

근거: [정적 빌드 설정](https://vercel.com/docs/builds/configure-a-build), [vercel.json 설정](https://vercel.com/docs/project-configuration/vercel-json).

## 5. 환경변수

환경변수는 비밀값을 코드와 분리해 서버에 전달하는 설정이다. 아래 내용으로 `.env.example`을 만든다.

```dotenv
OPENAI_API_KEY=replace_with_openai_project_key
OPENAI_MODEL=gpt-5.4-mini-2026-03-17
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=replace_with_supabase_secret_key
```

| 변수 | 필수 | 위치와 용도 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 필수 | 서버의 OpenAI 인증 |
| `OPENAI_MODEL` | 필수 | 고정 모델 ID. 누락 시 기본값으로 몰래 대체하지 않음 |
| `SUPABASE_URL` | 필수 | 운영 기록 DB의 주소 |
| `SUPABASE_SECRET_KEY` | 필수 | 서버 전용 Supabase secret key |

- 실제 값은 `.env.local`과 Vercel 환경변수 화면에만 둔다. 프런트 파일이나 `window.ENV`에 넣지 않는다.
- `PUBLIC_`, `VITE_`, `NEXT_PUBLIC_` 접두사로 비밀키를 노출하지 않는다.
- 설정 누락·명백한 형식 오류는 AI 호출 전에 `503 CONFIGURATION_ERROR`다. 설정이 채워졌으나 DB 연결·권한·저장이 실패하면 분석 결과를 유지하고 `meta.storage = "failed"`로 반환한다.
- 키가 없어도 테스트 의존성 주입과 정적 화면 작업은 진행할 수 있다. 실제 결과로 가장하지 않는다.
- Preview와 Production은 별도 개발/운영 Supabase 프로젝트 및 OpenAI 프로젝트 키를 사용한다. 실제 운영 데이터를 테스트 입력으로 사용하지 않는다.

`.gitignore` 필수 항목:

```gitignore
node_modules/
.env*
!.env.example
.vercel/
artifacts/
playwright-report/
test-results/
```

## 6. 실행 방법

1. 새 프로젝트면 3절의 설치를 진행한다. 기존 프로젝트를 받은 사람은 `npm ci`로 같은 버전을 설치한다.
2. `.env.example`을 `.env.local`로 복사하고 본인의 키를 채운다. 값을 화면 공유나 Git에 포함하지 않는다.
3. 05 문서의 SQL을 개발용 Supabase에 적용한다.
4. `npm run dev`를 실행하고 `http://localhost:3000`을 연다.
5. 빈 입력을 제출해 클라이언트 검증을 확인한 후 정상 문장으로 실제 연동을 검사한다.

`vercel dev --local`은 로컬 실행을 위한 선택이며 원격 환경변수를 자동으로 가져오지 않는다. 사용 중인 CLI가 해당 옵션을 지원하는지 `npx vercel dev --help`로 확인하고 lockfile에 기록된 버전을 유지한다. [Vercel dev 공식 문서](https://vercel.com/docs/cli/dev)를 따른다. `index.html` 더블클릭이나 Live Server만으로는 Node API가 실행되지 않는다.

## 7. 완료·검증 기준

- [ ] 설치 및 실행 명령을 복사해 개발 서버를 켤 수 있다.
- [ ] `/`는 HTML, CSS, JS를 정상 제공한다.
- [ ] `GET /api/analyze`는 HTML이 아니라 JSON 오류와 HTTP 405를 반환한다.
- [ ] `/.env.local`, `/src/server/...`, `/AGENTS.md`는 정적 파일로 제공되지 않는다.
- [ ] 테스트 실행에 실제 API 키가 필요하지 않다.
- [ ] Node 버전, 설치된 SDK·CLI 버전, 실행 명령을 인수인계 기록에 남겼다.
