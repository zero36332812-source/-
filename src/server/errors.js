// ==============================================================================
// src/server/errors.js
// 서버 에러 코드, HTTP 상태 코드 및 고정 메시지 정의 모듈
// ==============================================================================
// 04-api-ai-contract.md 지침에 명시된 에러 계약 테이블을 그대로 따릅니다.
// ==============================================================================

export const ERROR_DEFINITIONS = {
  INVALID_JSON: {
    status: 400,
    message: '요청을 읽을 수 없어요. 페이지를 새로고침해 주세요.',
    retryable: false
  },
  INVALID_REQUEST: {
    status: 400,
    message: '요청 형식이 올바르지 않아요. 페이지를 새로고침해 주세요.',
    retryable: false
  },
  EMPTY_TEXT: {
    status: 400,
    message: '분석할 문장을 입력해 주세요.',
    retryable: false
  },
  TEXT_TOO_LONG: {
    status: 400,
    message: '문장은 2,000자 이하로 입력해 주세요.',
    retryable: false
  },
  METHOD_NOT_ALLOWED: {
    status: 405,
    message: '지원하지 않는 요청 방식이에요.',
    retryable: false
  },
  PAYLOAD_TOO_LARGE: {
    status: 413,
    message: '입력 데이터가 너무 커요. 내용을 줄여 주세요.',
    retryable: false
  },
  UNSUPPORTED_MEDIA_TYPE: {
    status: 415,
    message: '요청 형식이 올바르지 않아요. 페이지를 새로고침해 주세요.',
    retryable: false
  },
  AI_REFUSED: {
    status: 422,
    message: '이 문장은 분석할 수 없어요. 표현을 바꿔 다시 시도해 주세요.',
    retryable: false
  },
  RATE_LIMITED: {
    status: 429,
    message: '요청이 많아요. 잠시 후 다시 시도해 주세요.',
    retryable: true
  },
  INVALID_AI_RESPONSE: {
    status: 502,
    message: '분석 결과를 확인하지 못했어요. 다시 시도해 주세요.',
    retryable: true
  },
  AI_UNAVAILABLE: {
    status: 503,
    message: '분석 서비스에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.',
    retryable: true
  },
  CONFIGURATION_ERROR: {
    status: 503,
    message: '서비스 준비 중이에요. 잠시 후 이용해 주세요.',
    retryable: false
  },
  AI_TIMEOUT: {
    status: 504,
    message: '분석 시간이 길어지고 있어요. 잠시 후 다시 시도해 주세요.',
    retryable: true
  },
  INTERNAL_ERROR: {
    status: 500,
    message: '처리 중 문제가 생겼어요. 다시 시도해 주세요.',
    retryable: true
  }
};

/**
 * 표준 에러 Response 객체를 생성합니다.
 * @param {string} code - 에러 코드명
 * @param {string} requestId - 요청 식별자 UUID
 * @param {object} [override] - 메시지나 retryable 등의 오버라이드 객체
 * @returns {Response}
 */
export function createErrorResponse(code, requestId, override = {}) {
  const def = ERROR_DEFINITIONS[code] || ERROR_DEFINITIONS.INTERNAL_ERROR;
  const status = override.status || def.status;
  const message = override.message || def.message;
  const retryable = typeof override.retryable === 'boolean' ? override.retryable : def.retryable;

  const body = {
    ok: false,
    requestId,
    error: {
      code,
      message,
      retryable
    }
  };

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };

  if (code === 'METHOD_NOT_ALLOWED') {
    headers['Allow'] = 'POST';
  }

  return new Response(JSON.stringify(body), {
    status,
    headers
  });
}

