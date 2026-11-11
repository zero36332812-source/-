// ==============================================================================
// src/server/openai-client.js
// OpenAI Responses API 어댑터 모듈
// ==============================================================================
// 04-api-ai-contract.md 지침 7항을 준수하여 20초 타임아웃, store: false,
// Structured Outputs 및 정밀한 예외 처리를 수행합니다.
// ==============================================================================

import OpenAI from 'openai';
import { SYSTEM_PROMPT, SENTIMENT_SCHEMA } from './sentiment-prompt.js';
import { validateAIOutput } from './validation.js';

const AI_TIMEOUT_MS = 20000;

/**
 * OpenAI API 호출 어댑터를 생성합니다.
 * @param {object} options
 * @param {string} options.apiKey - OpenAI API 키
 * @param {string} options.model - 모델 식별자 (예: gpt-5.4-mini-2026-03-17)
 */
export function createOpenAIAdapter({ apiKey, model }) {
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new Error('OPENAI_API_KEY_MISSING');
  }

  const client = new OpenAI({
    apiKey: apiKey.trim(),
    timeout: AI_TIMEOUT_MS,
    maxRetries: 0
  });

  const targetModel = model?.trim() || 'gpt-5.4-mini-2026-03-17';

  return {
    /**
     * 문장을 분석하여 감성, 신뢰도, 이유를 추출합니다.
     * @param {string} normalizedText - 검증된 입력 문장
     * @returns {Promise<{ sentiment: string, confidence: number, reason: string, model: string }>}
     */
    async analyze(normalizedText) {
      try {
        const response = await client.responses.create({
          model: targetModel,
          store: false,
          instructions: SYSTEM_PROMPT,
          input: [{ role: 'user', content: normalizedText }],
          reasoning: { effort: 'none' },
          max_output_tokens: 800,
          text: {
            format: {
              type: 'json_schema',
              name: 'sentiment_result',
              strict: true,
              schema: SENTIMENT_SCHEMA
            }
          }
        }, {
          signal: AbortSignal.timeout(AI_TIMEOUT_MS)
        });

        // 1. 거절(Refusal) 응답 검사
        if (response.output) {
          for (const item of response.output) {
            if (item.type === 'message' && item.content) {
              for (const content of item.content) {
                if (content.type === 'refusal') {
                  const error = new Error('AI Refused');
                  error.code = 'AI_REFUSED';
                  throw error;
                }
              }
            }
          }
        }

        // 2. 응답 상태 검사
        if (response.status !== 'completed' || !response.output_text) {
          const error = new Error('Incomplete or empty AI response');
          error.code = 'INVALID_AI_RESPONSE';
          throw error;
        }

        // 3. JSON 파싱
        let parsed;
        try {
          parsed = JSON.parse(response.output_text);
        } catch (e) {
          const error = new Error('JSON parse failed on AI output');
          error.code = 'INVALID_AI_RESPONSE';
          throw error;
        }

        // 4. 출력 스키마 및 값 범위 정밀 재검증
        const validation = validateAIOutput(parsed);
        if (!validation.valid) {
          const error = new Error('Validation failed on AI output fields');
          error.code = 'INVALID_AI_RESPONSE';
          throw error;
        }

        return {
          sentiment: validation.data.sentiment,
          confidence: validation.data.confidence,
          reason: validation.data.reason,
          model: response.model || targetModel
        };

      } catch (err) {
        // 이미 지정된 코드면 그대로 전파
        if (err.code === 'AI_REFUSED' || err.code === 'INVALID_AI_RESPONSE') {
          throw err;
        }

        // 타임아웃 검사
        if (err.name === 'TimeoutError' || err.name === 'AbortError' || err.code === 'ETIMEDOUT') {
          const timeoutErr = new Error('AI Timeout');
          timeoutErr.code = 'AI_TIMEOUT';
          throw timeoutErr;
        }

        // HTTP 상태 코드 기반 예외 변환
        const status = err.status || err.response?.status;
        const errMsg = String(err.message || '').toLowerCase();

        if (status === 429) {
          const rateErr = new Error('OpenAI Rate Limited');
          if (errMsg.includes('quota') || errMsg.includes('credit') || errMsg.includes('insufficient')) {
            rateErr.code = 'AI_UNAVAILABLE';
            rateErr.retryable = false;
          } else {
            rateErr.code = 'RATE_LIMITED';
            rateErr.retryable = true;
          }
          throw rateErr;
        }

        if (status === 401 || status === 403 || status === 404 || status === 400) {
          const configErr = new Error('OpenAI Configuration Error');
          configErr.code = 'CONFIGURATION_ERROR';
          configErr.retryable = false;
          throw configErr;
        }

        if (status >= 500) {
          const unavailErr = new Error('OpenAI Service Unavailable');
          unavailErr.code = 'AI_UNAVAILABLE';
          throw unavailErr;
        }

        // 기타 연결 오류
        const defaultErr = new Error('OpenAI General Error');
        defaultErr.code = 'AI_UNAVAILABLE';
        throw defaultErr;
      }
    }
  };
}

