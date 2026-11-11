// ==============================================================================
// public/js/api.js
// 클라이언트 API 통신 및 응답 계약 검증 모듈
// ==============================================================================
// 지침 문서(03-frontend-behavior.md, 04-api-ai-contract.md)를 엄격히 준수합니다.
// 25초 브라우저 타임아웃, AbortController 및 응답 데이터 무결성 검증을 수행합니다.
// ==============================================================================

const CLIENT_TIMEOUT_MS = 25000;

// HTTP 상태 코드별 안전한 기본 에러 문구
const HTTP_ERROR_DEFAULTS = {
  413: { code: 'PAYLOAD_TOO_LARGE', message: '입력 데이터가 너무 커요. 내용을 줄여 주세요.', retryable: false },
  429: { code: 'RATE_LIMITED', message: '요청이 많아요. 잠시 후 다시 시도해 주세요.', retryable: true },
  503: { code: 'AI_UNAVAILABLE', message: '분석 서비스에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.', retryable: true },
  504: { code: 'AI_TIMEOUT', message: '분석 시간이 길어지고 있어요. 잠시 후 다시 시도해 주세요.', retryable: true }
};

/**
 * 서버에 감성 분석을 요청합니다.
 * @param {string} text - 분석할 문장 (검증 완료된 문자열)
 * @param {AbortSignal} externalSignal - 외부 중단 시그널
 * @returns {Promise<{ ok: true, data: object, meta: object } | { ok: false, error: object }>}
 */
export async function analyzeSentiment(text, externalSignal) {
  const controller = new AbortController();

  // 외부 signal이 있다면 연결
  if (externalSignal) {
    externalSignal.addEventListener('abort', () => controller.abort());
  }

  // 25초 클라이언트 타임아웃 타이머
  const timeoutId = setTimeout(() => {
    controller.abort(new DOMException('Client Timeout', 'TimeoutError'));
  }, CLIENT_TIMEOUT_MS);

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ text }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    // JSON 응답 파싱 시도
    let data;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        data = await response.json();
      } catch (e) {
        data = null;
      }
    }

    // 1. 서버가 정상적인 JSON 응답을 반환한 경우
    if (data && typeof data === 'object') {
      if (response.ok && data.ok === true) {
        // 성공 응답 무결성 검증
        const validation = validateSuccessResponse(data);
        if (validation.valid) {
          return {
            ok: true,
            requestId: data.requestId,
            data: data.data,
            meta: data.meta
          };
        } else {
          return {
            ok: false,
            error: {
              code: 'INVALID_SERVER_RESPONSE',
              message: '분석 결과를 확인하지 못했어요. 다시 시도해 주세요.',
              retryable: true
            }
          };
        }
      }

      // 서버가 반환한 에러 응답
      if (data.ok === false && data.error) {
        return {
          ok: false,
          error: {
            code: data.error.code || 'UNKNOWN_ERROR',
            message: data.error.message || '처리 중 문제가 생겼어요. 다시 시도해 주세요.',
            retryable: typeof data.error.retryable === 'boolean' ? data.error.retryable : true
          }
        };
      }
    }

    // 2. JSON이 아니거나 WAF/Vercel 프록시에서 반환한 HTTP 상태 코드 처리
    const defaultError = HTTP_ERROR_DEFAULTS[response.status] || {
      code: 'INTERNAL_ERROR',
      message: '처리 중 문제가 생겼어요. 다시 시도해 주세요.',
      retryable: true
    };

    return {
      ok: false,
      error: defaultError
    };

  } catch (err) {
    clearTimeout(timeoutId);

    // 브라우저 25초 타임아웃
    if (err.name === 'TimeoutError' || controller.signal.aborted) {
      return {
        ok: false,
        error: {
          code: 'CLIENT_TIMEOUT',
          message: '분석 시간이 길어지고 있어요. 잠시 후 다시 시도해 주세요.',
          retryable: true
        }
      };
    }

    // 네트워크 단절 등 통신 오류
    return {
      ok: false,
      error: {
        code: 'NETWORK_ERROR',
        message: '연결을 확인한 뒤 다시 시도해 주세요.',
        retryable: true
      }
    };
  }
}

/**
 * 성공 응답 객체가 계약(04-api-ai-contract.md)에 부합하는지 엄격히 검증합니다.
 */
function validateSuccessResponse(body) {
  if (!body || typeof body !== 'object') return { valid: false };
  if (typeof body.requestId !== 'string' || body.requestId.trim().length === 0) return { valid: false };

  const { data, meta } = body;
  if (!data || typeof data !== 'object') return { valid: false };

  // sentiment 검증
  if (!['positive', 'negative', 'neutral'].includes(data.sentiment)) return { valid: false };

  // confidence 검증 (0~100 사이의 유한한 정수)
  if (!Number.isInteger(data.confidence) || data.confidence < 0 || data.confidence > 100) return { valid: false };

  // reason 검증 (1~200자 문자열)
  if (typeof data.reason !== 'string') return { valid: false };
  const reasonCount = Array.from(data.reason.trim()).length;
  if (reasonCount < 1 || reasonCount > 200) return { valid: false };

  // meta.storage 검증 ('saved' 또는 'failed')
  if (!meta || !['saved', 'failed'].includes(meta.storage)) return { valid: false };

  return { valid: true };
}

