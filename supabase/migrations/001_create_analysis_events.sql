-- ==============================================================================
-- 001_create_analysis_events.sql
-- 마음결(Maeumgyeol) 서비스 - 감성 분석 운영 메트릭 저장 테이블 생성 스크립트
-- ==============================================================================
-- [보안 및 개인정보 보호 원칙]
-- 1. 사용자가 입력한 문장 원문과 AI의 분석 이유는 개인정보 보호를 위해 DB에 절대 저장하지 않습니다.
-- 2. 서비스 운영 및 모니터링을 위한 최소한의 수치 정보(감성, 신뢰도, 글자 수, 응답속도)만 기록합니다.
-- 3. Row Level Security(RLS)를 활성화하여 익명(anon) 사용자나 일반 로그인 사용자가 조작할 수 없도록 차단하고,
--    오직 백엔드 서버(service_role)만 데이터를 안전하게 추가/조회할 수 있도록 통제합니다.
-- ==============================================================================

BEGIN;

-- 1. 분석 이벤트 테이블 생성
CREATE TABLE IF NOT EXISTS public.analysis_events (
  -- 요청 식별자: 백엔드 서버가 생성한 UUID (API 응답의 requestId와 일치하며 중복 저장을 방지함)
  request_id UUID PRIMARY KEY,
  
  -- 판정된 감성 결과: 반드시 'positive', 'negative', 'neutral' 중 하나여야 함
  sentiment TEXT NOT NULL
    CHECK (sentiment IN ('positive', 'negative', 'neutral')),
    
  -- AI 모델이 스스로 추정한 판단 확신 정도 (0 ~ 100 사이의 정수 백분율)
  confidence SMALLINT NOT NULL
    CHECK (confidence BETWEEN 0 AND 100),
    
  -- 사용자가 입력한 문장의 길이 (공백 제거 후 1자 이상 2,000자 이하)
  input_length INTEGER NOT NULL
    CHECK (input_length BETWEEN 1 AND 2000),
    
  -- 분석을 수행한 AI 모델 이름 (예: gpt-5.4-mini-2026-03-17)
  model TEXT NOT NULL
    CHECK (char_length(model) BETWEEN 1 AND 100),
    
  -- 서버가 요청을 받아 AI 응답 검증을 마칠 때까지 걸린 소요 시간 (밀리초, ms)
  latency_ms INTEGER NOT NULL
    CHECK (latency_ms >= 0),
    
  -- 데이터 생성 시각 (기본값: 데이터가 입력된 현재 UTC 시각)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. 시계열 조회를 위한 인덱스 생성
-- 날짜순 조회나 30일 경과 데이터 정리 작업을 빠르게 수행하기 위해 인덱스를 지정합니다.
CREATE INDEX IF NOT EXISTS analysis_events_created_at_idx
  ON public.analysis_events (created_at);

-- 3. 테이블 레벨 보안(RLS, Row Level Security) 활성화
-- 기본적으로 모든 외부 접근을 차단하는 보안 상태로 전환합니다.
ALTER TABLE public.analysis_events ENABLE ROW LEVEL SECURITY;

-- 4. 불필요하거나 위험한 공개 권한 완전 회수 (보안 강화)
-- 브라우저나 외부에서 anon(익명키) 또는 authenticated(일반 사용자)로 테이블을 읽거나 쓸 수 없게 차단합니다.
REVOKE ALL ON TABLE public.analysis_events FROM public, anon, authenticated;

-- 5. 오직 서버 사이드(service_role)에게만 제한적 권한 부여
-- 환경변수에 등록된 SUPABASE_SECRET_KEY를 사용하는 안전한 백엔드 서버만 추가(insert), 조회(select), 삭제(delete)가 가능합니다.
GRANT INSERT, SELECT, DELETE ON TABLE public.analysis_events TO service_role;

COMMIT;

