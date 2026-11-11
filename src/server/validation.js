// ==============================================================================
// src/server/validation.js
// 서버 사이드 입력 및 AI 출력 데이터 유효성 검증 모듈
// ==============================================================================
// 04-api-ai-contract.md 지침 2항 및 3항을 엄격히 준수합니다.
// ==============================================================================

/**
 * 파싱된 요청 JSON 본문의 구조와 입력 텍스트의 유효성을 검사합니다.
 * @param {any} body - 파싱된 요청 객체
 * @returns {{ valid: boolean, code?: string, text?: string, length?: number }}
 */
export function validateServerInput(body) {
  // 1. 객체 여부 및 키 검사: 오직 'text' 키 하나만 존재해야 함
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { valid: false, code: 'INVALID_REQUEST' };
  }

  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'text') {
    return { valid: false, code: 'INVALID_REQUEST' };
  }

  const text = body.text;
  if (typeof text !== 'string') {
    return { valid: false, code: 'INVALID_REQUEST' };
  }

  // 2. 글자 수 계산 (Unicode 코드 포인트 기준)
  const trimmed = text.trim();
  const codePointsLength = Array.from(trimmed).length;

  if (codePointsLength === 0) {
    return { valid: false, code: 'EMPTY_TEXT' };
  }

  if (codePointsLength > 2000) {
    return { valid: false, code: 'TEXT_TOO_LONG' };
  }

  return {
    valid: true,
    text: trimmed,
    length: codePointsLength
  };
}

/**
 * OpenAI로부터 전달받은 분석 결과 객체의 데이터 계약 준수 여부를 검증합니다.
 * @param {any} result - AI 응답 데이터 객체
 * @returns {{ valid: boolean, data?: { sentiment: string, confidence: number, reason: string } }}
 */
export function validateAIOutput(result) {
  if (!result || typeof result !== 'object') {
    return { valid: false };
  }

  const { sentiment, confidence, reason } = result;

  // sentiment 검증: 'positive', 'negative', 'neutral' 중 하나
  if (!['positive', 'negative', 'neutral'].includes(sentiment)) {
    return { valid: false };
  }

  // confidence 검증: 0~100 사이의 유한한 정수
  if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100) {
    return { valid: false };
  }

  // reason 검증: 문자열이며 공백 제거 후 1~200자
  if (typeof reason !== 'string') {
    return { valid: false };
  }

  const reasonLength = Array.from(reason.trim()).length;
  if (reasonLength < 1 || reasonLength > 200) {
    return { valid: false };
  }

  return {
    valid: true,
    data: {
      sentiment,
      confidence,
      reason: reason.trim()
    }
  };
}

