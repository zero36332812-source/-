// ==============================================================================
// tests/unit/validation.test.js
// 클라이언트 및 서버 입력 유효성 검증 단위 테스트
// ==============================================================================
// 테스트 대상: T-01, T-02, T-03, T-04
// ==============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { countCharacters, validateInput } from '../../public/js/validation.js';
import { validateServerInput, validateAIOutput } from '../../src/server/validation.js';

test('T-01: 빈 문자열, 공백만, 줄바꿈만 입력 시 차단 검증', () => {
  const emptyCases = ['', '   ', '\n\n', '\t  \r\n'];

  for (const text of emptyCases) {
    // 1. 프론트엔드 검증
    const clientResult = validateInput(text);
    assert.equal(clientResult.valid, false);
    assert.equal(clientResult.code, 'EMPTY_TEXT');

    // 2. 서버 검증
    const serverResult = validateServerInput({ text });
    assert.equal(serverResult.valid, false);
    assert.equal(serverResult.code, 'EMPTY_TEXT');
  }
});

test('T-02: 글자 수 경계값 (1자, 2,000자, 2,001자) 검증', () => {
  // 1자 (정상 허용)
  const oneChar = '가';
  assert.equal(validateInput(oneChar).valid, true);
  assert.equal(validateServerInput({ text: oneChar }).valid, true);

  // 2,000자 (정상 허용)
  const maxChar = '가'.repeat(2000);
  assert.equal(validateInput(maxChar).valid, true);
  assert.equal(validateServerInput({ text: maxChar }).valid, true);

  // 2,001자 (초과 차단)
  const overChar = '가'.repeat(2001);
  const clientOver = validateInput(overChar);
  assert.equal(clientOver.valid, false);
  assert.equal(clientOver.code, 'TEXT_TOO_LONG');

  const serverOver = validateServerInput({ text: overChar });
  assert.equal(serverOver.valid, false);
  assert.equal(serverOver.code, 'TEXT_TOO_LONG');
});

test('T-03: 이모지 조합 및 코드 포인트 계산 검증', () => {
  // 2,000개 이모지
  const emojiMax = '😊'.repeat(2000);
  assert.equal(countCharacters(emojiMax), 2000);
  assert.equal(validateInput(emojiMax).valid, true);
  assert.equal(validateServerInput({ text: emojiMax }).valid, true);

  // 2,001개 이모지
  const emojiOver = '😊'.repeat(2001);
  assert.equal(countCharacters(emojiOver), 2001);
  assert.equal(validateInput(emojiOver).valid, false);
  assert.equal(validateServerInput({ text: emojiOver }).valid, false);

  // 앞뒤 공백이 있는 경우 trim 처리 확인
  const spacedEmoji = '   😊😊😊   ';
  assert.equal(countCharacters(spacedEmoji), 3);
  const validRes = validateInput(spacedEmoji);
  assert.equal(validRes.valid, true);
  assert.equal(validRes.count, 3);
});

test('T-04: 내부 줄바꿈 및 공백 보존 검증', () => {
  const multilineText = '첫 번째 줄입니다.\n두 번째 줄입니다.   중간 공백';
  const serverResult = validateServerInput({ text: multilineText });
  assert.equal(serverResult.valid, true);
  assert.equal(serverResult.text, multilineText);
});

test('T-09, T-10: AI 출력 유효성 검증 (validateAIOutput)', () => {
  // 정상 허용 (신뢰도 0, 100 포함)
  assert.equal(validateAIOutput({ sentiment: 'positive', confidence: 0, reason: '이유입니다.' }).valid, true);
  assert.equal(validateAIOutput({ sentiment: 'negative', confidence: 100, reason: '이유입니다.' }).valid, true);
  assert.equal(validateAIOutput({ sentiment: 'neutral', confidence: 50, reason: '이유입니다.' }).valid, true);

  // confidence 범위 초과 (-1, 101) 및 소수, 문자열
  assert.equal(validateAIOutput({ sentiment: 'positive', confidence: -1, reason: '이유' }).valid, false);
  assert.equal(validateAIOutput({ sentiment: 'positive', confidence: 101, reason: '이유' }).valid, false);
  assert.equal(validateAIOutput({ sentiment: 'positive', confidence: 85.5, reason: '이유' }).valid, false);
  assert.equal(validateAIOutput({ sentiment: 'positive', confidence: '85', reason: '이유' }).valid, false);

  // 미등록 라벨
  assert.equal(validateAIOutput({ sentiment: 'happy', confidence: 80, reason: '이유' }).valid, false);

  // 이유 길이 초과 (201자) 및 빈 이유
  assert.equal(validateAIOutput({ sentiment: 'positive', confidence: 80, reason: '' }).valid, false);
  assert.equal(validateAIOutput({ sentiment: 'positive', confidence: 80, reason: '   ' }).valid, false);
  assert.equal(validateAIOutput({ sentiment: 'positive', confidence: 80, reason: '가'.repeat(201) }).valid, false);
});

