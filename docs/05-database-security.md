# 05. Supabase 데이터와 보안 지침

DB는 정보를 저장하는 공간이다. 이번 MVP에서는 **성공한 분석의 운영 기록**에만 사용한다. 사용자용 히스토리 기능은 없다. API 계약은 [04 문서](04-api-ai-contract.md)를 따른다.

## 1. 저장 범위

| 저장함 | 저장하지 않음 |
| --- | --- |
| 서버가 만든 요청 ID | 입력 원문·원문 해시 |
| 감성 라벨·신뢰도 | 분석 이유·전체 AI 응답 |
| 입력 글자 수 | 이름·이메일·사용자 ID |
| 모델 ID·처리 시간·생성 시각 | IP·쿠키·User-Agent·세션 ID·키·프롬프트 |

브라우저에도 localStorage, sessionStorage, IndexedDB로 원문·결과를 보관하지 않는다. 현재 페이지 메모리만 사용한다. 애플리케이션 로그는 `requestId`, 정해진 이벤트 코드, HTTP 상태, 처리 시간만 남길 수 있다. SDK 오류 객체 전체·요청 본문·HTTP 헤더를 로깅하지 않는다. 호스팅 제공자 자체 접속 로그와 앱 로그는 별개다.

## 2. 테이블 정의

테이블명: `public.analysis_events`. 아래 SQL을 `supabase/migrations/001_create_analysis_events.sql`에 저장하고 **개발용 프로젝트의 SQL Editor**에서 한 번 실행한다. 기존 테이블을 DROP하거나 데이터 초기화하지 않는다.

```sql
begin;

create table public.analysis_events (
  request_id uuid primary key,
  sentiment text not null
    check (sentiment in ('positive', 'negative', 'neutral')),
  confidence smallint not null
    check (confidence between 0 and 100),
  input_length integer not null
    check (input_length between 1 and 2000),
  model text not null
    check (char_length(model) between 1 and 100),
  latency_ms integer not null
    check (latency_ms >= 0),
  created_at timestamptz not null default now()
);

create index analysis_events_created_at_idx
  on public.analysis_events (created_at);

alter table public.analysis_events enable row level security;

revoke all on table public.analysis_events from public, anon, authenticated;
grant insert, select, delete on table public.analysis_events to service_role;

commit;
```

| 필드 | 생성 주체·의미 |
| --- | --- |
| `request_id` | Node 서버 UUID. API `requestId`와 동일 |
| `sentiment`, `confidence` | 검증이 끝난 AI 결과 |
| `input_length` | trim 후 code point 수 |
| `model` | 실제 OpenAI 응답의 `model` 식별자. 누락 시 구성 오류로 보지 않고 요청에 사용한 `OPENAI_MODEL` 기록 |
| `latency_ms` | 서버가 요청을 받은 시점부터 AI 출력 검증을 마친 시점까지 정수 ms. DB 대기 제외 |
| `created_at` | DB의 UTC 시각. 브라우저에서 전달하지 않음 |

`service_role`은 DB 권한 역할 이름이다. 아래에서 사용하는 환경변수 `SUPABASE_SECRET_KEY`를 예전 키 이름으로 바꾸라는 의미가 아니다. PK로 같은 요청 ID가 두 번 저장되는 것을 막는다. 운영 코드에서 upsert로 기존 기록을 덮어쓰지 않는다.

## 3. 접근 권한

RLS(Row Level Security)는 DB의 행 단위 접근 제어다. 이 서비스는 사용자가 DB를 직접 읽고 쓰지 않으므로 `anon`과 `authenticated`에 정책을 만들지 않고 권한도 제거한다.

- 서버는 Supabase의 **secret key**를 사용한다. 브라우저에 Supabase SDK·키를 전달하지 않는다.
- secret key는 높은 권한으로 RLS를 우회하므로, RLS가 켜져 있어도 키 유출을 보호해 주지 않는다.
- 로그인 세션이나 사용자 토큰을 서버 관리자 클라이언트에 섞지 않는다.
- 공개 조회 API, 무조건 참인 `USING (true)` 정책, 익명 insert 정책을 만들지 않는다.
- Supabase Dashboard 접근은 프로젝트 운영자에게만 허용한다. 운영자도 원문을 볼 수 있도록 저장 필드를 확장하지 않는다.

근거: [Supabase API 키](https://supabase.com/docs/guides/getting-started/api-keys), [RLS 공식 문서](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 4. 서버 저장 로직

```js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

const { error } = await supabase
  .from('analysis_events')
  .insert({
    request_id: requestId,
    sentiment: result.sentiment,
    confidence: result.confidence,
    input_length: inputLength,
    model: modelId,
    latency_ms: latencyMs
  })
  .abortSignal(AbortSignal.timeout(2_000));
```

위 코드는 저장 형태 예시다. 실제 구현에서는 초기화 오류·반환 `error`·네트워크 예외·Abort를 모두 처리한다. SDK 버전에서 `.abortSignal()` 지원 여부를 공식 [Supabase JavaScript 참조](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal)와 설치 버전으로 확인한다.

- 저장은 AI 결과 검증 후에 한 번 수행한다. `.select()`를 연결해 저장 데이터를 다시 읽을 필요가 없다.
- 실패한 분석과 유효하지 않은 입력은 저장하지 않는다.
- 저장이 2초 안에 성공하면 `saved`, 실패·시간 초과면 `failed`다. 타임아웃 직전에 DB가 반영했을 가능성은 남는다.
- 저장을 기다리지 않고 응답한 뒤 실행하는 fire-and-forget을 쓰지 않는다. 서버리스 함수 종료로 기록이 유실될 수 있다.
- 오류 시 감성 결과를 폐기하거나 OpenAI를 다시 호출하지 않는다.
- 입력 객체나 AI 전체 객체를 spread로 insert하지 않는다. 위 허용 필드만 명시한다.
- 원문·이유를 적재하는 백업 테이블이나 실패 큐를 추가하지 않는다.

## 5. 보관과 정리

운영 기록의 보관 목표는 **30일**이다. MVP에서는 운영자가 매주 아래 SQL로 30일 초과 기록을 삭제한다. 따라서 실제 삭제는 주간 실행 간격에 따라 최대 약 37일 이내다. 정확히 30일에 자동 삭제된다고 안내하지 않는다. 별도 Cron·자동화 기능은 현재 범위에 없다.

```sql
delete from public.analysis_events
where created_at < now() - interval '30 days';
```

삭제 작업은 운영 문서에 실행 날짜만 기록한다. 제공자의 백업 보관 정책과 앱의 활성 테이블 정리는 구분한다.

## 6. 화면의 데이터 안내

입력창과 제출 버튼 사이에 다음 문구를 항상 표시한다. 추가 설명은 `데이터 처리 안내` 접기/펼치기 영역으로 둔다. 배치는 02 문서를 따른다.

> 입력한 문장은 분석을 위해 OpenAI로 전송돼요. 우리 서비스 DB에는 원문과 분석 이유를 저장하지 않아요. 이름·연락처 등 개인정보는 입력하지 마세요.

펼친 설명:

> 이 서비스의 DB에는 입력 원문과 분석 이유를 저장하지 않아요. 감성 결과, 신뢰도, 글자 수, 처리 시간 등의 운영 정보만 기록해요. 현재 입력과 결과는 새로고침하면 사라져요. 외부 AI 제공자의 데이터 처리 정책은 별도로 적용돼요.

OpenAI 요청은 `store: false`로 보내지만 이를 “어디에도 저장되지 않음”으로 표현하지 않는다. [OpenAI 데이터 관리 문서](https://developers.openai.com/api/docs/guides/your-data)를 안내 링크로 제공한다. 이 문서는 법률 준수 인증이나 개인정보 처리방침 전문을 대신하지 않으며, 제품에 불필요한 동의 팝업을 추가하라는 지시는 아니다.

## 7. 기본 호출 제한

공개 Vercel 배포는 **POST `/api/analyze`에 IP별·리전별 고정 60초 창당 10회**의 WAF 규칙을 적용한다. 설정과 검증은 [06 문서](06-testing-deployment.md)에 있다.

브라우저 버튼 비활성화는 같은 화면의 중복 클릭만 막는다. 서버리스 함수 메모리의 Map은 인스턴스 간 공유되지 않으므로 전역 제한으로 사용하지 않는다. 앱 DB에 IP를 저장하는 자체 제한 기능도 추가하지 않는다. WAF는 기본 남용 방지이며 API 비용의 절대 상한을 보장하지 않는다.

## 8. 완료·검증 기준

- [ ] 마이그레이션이 새 개발 DB에서 성공한다.
- [ ] RLS가 활성화되어 있고 anon/authenticated에 허용 정책·테이블 권한이 없다.
- [ ] publishable/anon 키를 사용한 직접 조회·insert가 허용되지 않는다. 테스트는 개발 환경에서만 한다.
- [ ] 서버 secret key로 정상 분석 1회당 기록 1개가 저장된다.
- [ ] 원문·이유·IP 등의 금지 컬럼과 금지 값이 DB·로그·브라우저 저장소에 없다.
- [ ] DB 연결 실패와 2초 초과를 주입해도 HTTP 200 분석 결과와 `storage: failed`를 확인한다.
- [ ] 동일 request_id를 재삽입하면 중복 오류가 나고 레코드는 하나다.
- [ ] 운영자가 보관·정리 방법과 비밀키 위치를 이해할 수 있다.
