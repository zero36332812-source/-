// ==============================================================================
// src/server/analyze-handler.js
// Vercel Serverless Function 핵심 분석 요청 핸들러
// ==============================================================================
// 04-api-ai-contract.md 지침의 순서와 규칙을 엄격히 준수합니다.
// Web 표준 Request -> Response 구조로 동작합니다.
// ==============================================================================

import crypto from 'node:crypto';
import { createErrorResponse } from './errors.js';
import { validateServerInput } from './validation.js';

const MAX_PAYLOAD_BYTES = 16 * 1024; // 16 KiB (16,384 bytes)

/**
 * 분석 핸들러 팩토리 함수 (의존성 주입 지원)
 * @param {object} deps - 의존성 객체 { getAIAdapter, getRepository }
 * @returns {(request: Request) => Promise<Response>}
 */
export function createAnalyzeHandler(deps) {
  return async function handleAnalyze(request) {
    const requestId = crypto.randomUUID();

    // 1. HTTP 메서드 검사 (오직 POST만 허용)
    if (request.method !== 'POST') {
      return createErrorResponse('METHOD_NOT_ALLOWED', requestId);
    }

    // 2. Content-Type 검사
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return createErrorResponse('UNSUPPORTED_MEDIA_TYPE', requestId);
    }

    // 3. 요청 본문 읽기 및 16 KiB 누적 바이트 검사
    let rawBody = '';
    try {
      if (!request.body) {
        return createErrorResponse('INVALID_JSON', requestId);
      }

      const reader = request.body.getReader();
      let totalBytes = 0;
      const decoder = new TextDecoder('utf-8', { fatal: true });

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalBytes += value.byteLength;
        if (totalBytes > MAX_PAYLOAD_BYTES) {
          await reader.cancel();
          return createErrorResponse('PAYLOAD_TOO_LARGE', requestId);
        }
        rawBody += decoder.decode(value, { stream: true });
      }
      rawBody += decoder.decode(); // 잔여 버퍼 flush
    } catch (err) {
      return createErrorResponse('INVALID_JSON', requestId);
    }

    // 4. JSON 파싱
    let parsedBody;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (err) {
      return createErrorResponse('INVALID_JSON', requestId);
    }

    // 5. 서버 입력 스키마 및 길이 검증
    const validation = validateServerInput(parsedBody);
    if (!validation.valid) {
      return createErrorResponse(validation.code || 'INVALID_REQUEST', requestId);
    }

    // 6. AI 어댑터 및 환경변수 설정 검사
    const aiAdapter = deps.getAIAdapter();
    if (!aiAdapter) {
      return createErrorResponse('CONFIGURATION_ERROR', requestId);
    }

    // 7. AI 분석 실행 및 소요시간(latency) 측정
    const startTime = Date.now();
    let aiResult;

    try {
      aiResult = await aiAdapter.analyze(validation.text);
    } catch (err) {
      const errorCode = err.code || 'INTERNAL_ERROR';
      return createErrorResponse(errorCode, requestId, {
        retryable: typeof err.retryable === 'boolean' ? err.retryable : undefined
      });
    }

    const latencyMs = Date.now() - startTime;

    // 8. Supabase 운영 메트릭 저장 (원문 및 이유는 저장하지 않음)
    let storageStatus = 'failed';
    try {
      const repository = deps.getRepository();
      storageStatus = await repository.saveEvent({
        requestId,
        sentiment: aiResult.sentiment,
        confidence: aiResult.confidence,
        inputLength: validation.length,
        model: aiResult.model,
        latencyMs
      });
    } catch (err) {
      storageStatus = 'failed';
    }

    // 9. 정상 성공 응답 반환
    const responsePayload = {
      ok: true,
      requestId,
      data: {
        sentiment: aiResult.sentiment,
        confidence: aiResult.confidence,
        reason: aiResult.reason
      },
      meta: {
        storage: storageStatus
      }
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      }
    });
  };
}

