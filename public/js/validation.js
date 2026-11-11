// ==============================================================================
// public/js/validation.js
// 클라이언트(브라우저) 입력 유효성 검사 모듈
// ==============================================================================
// 지침 문서(03-frontend-behavior.md, 04-api-ai-contract.md)의 유효성 검증 규칙을
// 단일화하여 브라우저에서 즉각적인 피드백을 제공하고 불필요한 API 요청을 차단합니다.
// ==============================================================================

/**
 * 텍스트의 실제 Unicode 코드 포인트 기준 글자 수를 계산합니다.
 * 단순 String.length가 아닌 Array.from().length를 사용하여 한글과 이모지를 안전하게 측정합니다.
 * @param {string} text - 원본 입력 문자열
 * @returns {number} 앞뒤 공백을 제외한 글자 수
 */
export function countCharacters(text) {
  if (typeof text !== 'string') return 0;
  const trimmed = text.trim();
  return Array.from(trimmed).length;
}

/**
 * 사용자 입력 문자열이 서비스 정책(1자 이상 2,000자 이하)에 맞는지 검증합니다.
 * @param {string} text - 사용자가 입력한 문자열
 * @returns {{ valid: boolean, message?: string, code?: string, normalizedText?: string, count: number }}
 */
export function validateInput(text) {
  if (typeof text !== 'string') {
    return {
      valid: false,
      code: 'EMPTY_TEXT',
      message: '분석할 문장을 입력해 주세요.',
      count: 0
    };
  }

  const trimmed = text.trim();
  const count = Array.from(trimmed).length;

  // 1. 공백만 있거나 아예 비어있는 경우
  if (count === 0) {
    return {
      valid: false,
      code: 'EMPTY_TEXT',
      message: '분석할 문장을 입력해 주세요.',
      count: 0
    };
  }

  // 2. 허용 최대 글자 수(2,000자)를 초과한 경우
  if (count > 2000) {
    return {
      valid: false,
      code: 'TEXT_TOO_LONG',
      message: '문장은 2,000자 이하로 입력해 주세요.',
      count
    };
  }

  // 3. 정상적으로 검증을 통과한 경우
  return {
    valid: true,
    normalizedText: trimmed,
    count
  };
}

