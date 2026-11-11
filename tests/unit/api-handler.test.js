// ==============================================================================
// tests/unit/api-handler.test.js
// 서버 API 핸들러 계약 및 에러 처리 단위 테스트
// ==============================================================================
// 테스트 대상: T-05, T-06, T-07, T-08, T-11, T-12, T-14, T-17, T-22, T-23
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyzeHandler } from '../../src/server/analyze-handler.js';

// 가짜 목(mock) 어댑터 및 레포지토리 생성 헬퍼
function createMockDeps({ aiResult, aiError, saveResult = 'saved' } = {}) {
  let aiCallCount = 0;
  let saveEventParams = null;

  return {
    deps: {
      getAIAdapter() {
        return {
          async analyze(text) {
            aiCallCount++;
            if (aiError) throw aiError;
            return aiResult || {
              sentiment: 'positive',
              confidence: 90,
              reason: '테스트 이유입니다.',
              model: 'gpt-5.4-mini-2026-03-17'
            };
          }
        };
      },
      getRepository() {
        return {
          async saveEvent(params) {
            saveEventParams = params;
            return saveResult;
          }
        };
      }
    },
    getAICallCount: () => aiCallCount,
    getSaveEventParams: () => saveEventParams
  };
}

test('T-05: GET, PUT, OPTIONS 요청 시 405 METHOD_NOT_ALLOWED 및 Allow 헤더 검증', async () => {
  const { deps, getAICallCount } = createMockDeps();
  const handler = createAnalyzeHandler(deps);

  for (const method of ['GET', 'PUT', 'DELETE', 'OPTIONS']) {
    const req = new Request('http://localhost:3000/api/analyze', { method });
    const res = await handler(req);
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'POST');

    const body = await res.json();
    assert.equal(body.ok, false);
    assert.equal(body.error.code, 'METHOD_NOT_ALLOWED');
  }

  // 외부 AI 호출은 0회여야 함
  assert.equal(getAICallCount(), 0);
});

test('T-06: 잘못된 Content-Type 및 깨진 JSON 요청 검증', async () => {
  const { deps, getAICallCount } = createMockDeps();
  const handler = createAnalyzeHandler(deps);

  // 1. Content-Type: text/plain -> 415
  const reqPlain = new Request('http://localhost:3000/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: 'plain text'
  });
  const resPlain = await handler(reqPlain);
  assert.equal(resPlain.status, 415);
  const plainBody = await resPlain.json();
  assert.equal(plainBody.error.code, 'UNSUPPORTED_MEDIA_TYPE');

  // 2. 깨진 JSON -> 400 INVALID_JSON
  const reqBroken = new Request('http://localhost:3000/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"text": '
  });
  const resBroken = await handler(reqBroken);
  assert.equal(resBroken.status, 400);
  const brokenBody = await resBroken.json();
  assert.equal(brokenBody.error.code, 'INVALID_JSON');

  // 3. 잘못된 객체 구조 (text 외 다른 키 존재) -> 400 INVALID_REQUEST
  const reqExtra = new Request('http://localhost:3000/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '안녕', extra: 'bad' })
  });
  const resExtra = await handler(reqExtra);
  assert.equal(resExtra.status, 400);
  const extraBody = await resExtra.json();
  assert.equal(extraBody.error.code, 'INVALID_REQUEST');

  assert.equal(getAICallCount(), 0);
});

test('T-07: 16 KiB 초과 요청 본문 차단 (413 PAYLOAD_TOO_LARGE)', async () => {
  const { deps, getAICallCount } = createMockDeps();
  const handler = createAnalyzeHandler(deps);

  // 17 KiB 크기의 문자열
  const largeText = 'A'.repeat(17 * 1024);
  const reqLarge = new Request('http://localhost:3000/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: largeText })
  });

  const resLarge = await handler(reqLarge);
  assert.equal(resLarge.status, 413);
  const body = await resLarge.json();
  assert.equal(body.error.code, 'PAYLOAD_TOO_LARGE');

  assert.equal(getAICallCount(), 0);
});

test('T-08, T-23: 정상 분석 성공 응답 계약 및 헤더 검증', async () => {
  const { deps, getAICallCount, getSaveEventParams } = createMockDeps({
    aiResult: {
      sentiment: 'positive',
      confidence: 95,
      reason: '매우 긍정적인 표현이 담겨 있습니다.',
      model: 'gpt-5.4-mini-2026-03-17'
    }
  });

  const handler = createAnalyzeHandler(deps);

  const req = new Request('http://localhost:3000/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '정말 기쁘고 행복해요!' })
  });

  const res = await handler(req);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'no-store');

  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.requestId, 'string');
  assert.equal(body.data.sentiment, 'positive');
  assert.equal(body.data.confidence, 95);
  assert.equal(body.data.reason, '매우 긍정적인 표현이 담겨 있습니다.');
  assert.equal(body.meta.storage, 'saved');

  assert.equal(getAICallCount(), 1);

  // T-22: DB에 저장된 필드 검증 (원문과 이유는 포함되지 않아야 함!)
  const saved = getSaveEventParams();
  assert.ok(saved);
  assert.equal(saved.sentiment, 'positive');
  assert.equal(saved.confidence, 95);
  assert.equal(saved.inputLength, 12);
  assert.equal(saved.model, 'gpt-5.4-mini-2026-03-17');
  assert.equal(typeof saved.latencyMs, 'number');
  assert.equal('text' in saved, false);
  assert.equal('reason' in saved, false);
});

test('T-11: AI 응답 거절 (AI_REFUSED) 및 불완전 응답 검증', async () => {
  const refusalErr = new Error('Refused');
  refusalErr.code = 'AI_REFUSED';
  refusalErr.retryable = false;

  const { deps } = createMockDeps({ aiError: refusalErr });
  const handler = createAnalyzeHandler(deps);

  const req = new Request('http://localhost:3000/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '위험한 질문' })
  });

  const res = await handler(req);
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error.code, 'AI_REFUSED');
  assert.equal(body.error.retryable, false);
});

test('T-12, T-13: AI 타임아웃 및 속도 제한 에러 매핑 검증', async () => {
  // 1. 타임아웃 (504)
  const timeoutErr = new Error('Timeout');
  timeoutErr.code = 'AI_TIMEOUT';
  const { deps: timeoutDeps } = createMockDeps({ aiError: timeoutErr });
  const timeoutHandler = createAnalyzeHandler(timeoutDeps);

  const resTimeout = await timeoutHandler(new Request('http://localhost:3000/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '테스트 문장' })
  }));
  assert.equal(resTimeout.status, 504);
  assert.equal((await resTimeout.json()).error.code, 'AI_TIMEOUT');

  // 2. 429 Rate Limit (429)
  const rateErr = new Error('Rate limit');
  rateErr.code = 'RATE_LIMITED';
  rateErr.retryable = true;
  const { deps: rateDeps } = createMockDeps({ aiError: rateErr });
  const rateHandler = createAnalyzeHandler(rateDeps);

  const resRate = await rateHandler(new Request('http://localhost:3000/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '테스트 문장' })
  }));
  assert.equal(resRate.status, 429);
  assert.equal((await resRate.json()).error.code, 'RATE_LIMITED');
});

test('T-14: 환경변수 누락 시 CONFIGURATION_ERROR (503)', async () => {
  const missingConfigDeps = {
    getAIAdapter: () => null,
    getRepository: () => null
  };
  const handler = createAnalyzeHandler(missingConfigDeps);

  const req = new Request('http://localhost:3000/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '테스트 문장' })
  });

  const res = await handler(req);
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error.code, 'CONFIGURATION_ERROR');
  assert.equal(body.error.retryable, false);
});

test('T-17: DB 저장 실패 시에도 분석 결과는 HTTP 200으로 반환되고 storage는 failed', async () => {
  const { deps } = createMockDeps({
    aiResult: {
      sentiment: 'neutral',
      confidence: 60,
      reason: '담담한 문장입니다.',
      model: 'gpt-5.4-mini-2026-03-17'
    },
    saveResult: 'failed' // DB 저장 실패 시뮬레이션
  });

  const handler = createAnalyzeHandler(deps);

  const req = new Request('http://localhost:3000/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: '회의 일정 안내입니다.' })
  });

  const res = await handler(req);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.data.sentiment, 'neutral');
  assert.equal(body.meta.storage, 'failed');
});
