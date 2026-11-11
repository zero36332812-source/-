// ==============================================================================
// public/js/ui.js
// 화면(DOM) 렌더링 및 UI 상태 갱신 모듈
// ==============================================================================
// 보안 원칙:
// XSS(악성 스크립트 실행) 공격을 방지하기 위해 innerHTML 대신 반드시 textContent를 사용합니다.
// ==============================================================================

// 감성 코드와 한글 레이블 및 캐릭터 입 모양 클래스 매핑
const SENTIMENT_MAP = {
  positive: { label: '긍정', mouthClass: 'mouth-positive', cardClass: 'state-positive' },
  negative: { label: '부정', mouthClass: 'mouth-negative', cardClass: 'state-negative' },
  neutral: { label: '중립', mouthClass: 'mouth-neutral', cardClass: 'state-neutral' }
};

/**
 * DOM 요소들을 캐싱하여 반환합니다.
 */
export function getElements() {
  return {
    form: document.getElementById('sentiment-form'),
    textarea: document.getElementById('sentence-input'),
    charCount: document.getElementById('char-count'),
    inputError: document.getElementById('input-error'),
    submitBtn: document.getElementById('submit-btn'),
    submitBtnText: document.querySelector('#submit-btn .btn-text'),
    resetBtn: document.getElementById('reset-btn'),
    exampleBtns: document.querySelectorAll('.btn-example'),
    retryBtn: document.getElementById('retry-btn'),

    // 결과 카드 요소
    resultCard: document.getElementById('result-card'),
    bearMouth: document.getElementById('bear-mouth'),
    panelIdle: document.getElementById('panel-idle'),
    panelLoading: document.getElementById('panel-loading'),
    panelSuccess: document.getElementById('panel-success'),
    panelError: document.getElementById('panel-error'),

    // 성공 패널 상세 요소
    sentimentLabel: document.getElementById('sentiment-label'),
    confidenceValue: document.getElementById('confidence-value'),
    confidenceBarFill: document.getElementById('confidence-bar-fill'),
    sentimentReason: document.getElementById('sentiment-reason'),
    storageWarning: document.getElementById('storage-warning'),

    // 에러 패널 상세 요소
    errorTitle: document.getElementById('error-title'),
    errorMessage: document.getElementById('error-message')
  };
}

/**
 * 글자 수 카운터 및 2,000자 초과 시 시각적 스타일을 갱신합니다.
 */
export function updateCharCount(elements, count) {
  elements.charCount.textContent = `${count.toLocaleString()} / 2,000자`;
  if (count > 2000) {
    elements.charCount.classList.add('over-limit');
    elements.textarea.setAttribute('aria-invalid', 'true');
  } else {
    elements.charCount.classList.remove('over-limit');
    if (!elements.inputError.textContent) {
      elements.textarea.removeAttribute('aria-invalid');
    }
  }
}

/**
 * 입력창 하단 인라인 오류 메시지를 표시하거나 숨깁니다.
 */
export function showInputError(elements, message) {
  if (message) {
    elements.inputError.textContent = message;
    elements.inputError.hidden = false;
    elements.textarea.setAttribute('aria-invalid', 'true');
  } else {
    elements.inputError.textContent = '';
    elements.inputError.hidden = true;
    elements.textarea.removeAttribute('aria-invalid');
  }
}

/**
 * 곰 캐릭터의 표정(입 모양)을 설정합니다.
 */
function setBearExpression(elements, expression) {
  elements.bearMouth.className = 'bear-mouth';
  if (expression === 'positive') {
    elements.bearMouth.classList.add('mouth-positive');
  } else if (expression === 'negative') {
    elements.bearMouth.classList.add('mouth-negative');
  } else if (expression === 'neutral') {
    elements.bearMouth.classList.add('mouth-neutral');
  } else {
    elements.bearMouth.classList.add('mouth-idle');
  }
}

/**
 * 결과 카드 패널을 전환합니다.
 */
function switchPanel(elements, activePanel) {
  elements.panelIdle.hidden = activePanel !== 'idle';
  elements.panelLoading.hidden = activePanel !== 'loading';
  elements.panelSuccess.hidden = activePanel !== 'success';
  elements.panelError.hidden = activePanel !== 'error';
}

/**
 * 결과 카드의 배경 테마 클래스를 변경합니다.
 */
function setResultCardTheme(elements, themeClass) {
  elements.resultCard.className = 'card result-card ' + themeClass;
}

/**
 * 전체 화면 상태를 단일 함수에서 안전하게 렌더링합니다.
 * @param {object} elements - DOM 요소 컬렉션
 * @param {object} state - 현재 앱 상태 객체
 */
export function renderApp(elements, state) {
  const { status, result, error, storageStatus } = state;

  // 1. 대기 및 입력 중 상태 (idle / editing)
  if (status === 'idle' || status === 'editing') {
    elements.textarea.readOnly = false;
    elements.submitBtn.disabled = false;
    elements.resetBtn.disabled = false;
    elements.exampleBtns.forEach(btn => (btn.disabled = false));
    elements.submitBtnText.textContent = '감성 분석하기';

    elements.resultCard.setAttribute('aria-busy', 'false');
    setResultCardTheme(elements, 'state-idle');
    setBearExpression(elements, 'idle');
    switchPanel(elements, 'idle');
    return;
  }

  // 2. 분석 진행 중 상태 (loading)
  if (status === 'loading') {
    elements.textarea.readOnly = true;
    elements.submitBtn.disabled = true;
    elements.resetBtn.disabled = true;
    elements.exampleBtns.forEach(btn => (btn.disabled = true));
    elements.retryBtn.disabled = true;
    elements.submitBtnText.textContent = '분석 중…';

    elements.resultCard.setAttribute('aria-busy', 'true');
    setResultCardTheme(elements, 'state-loading');
    setBearExpression(elements, 'idle');
    switchPanel(elements, 'loading');
    showInputError(elements, null);
    return;
  }

  // 3. 분석 성공 상태 (success)
  if (status === 'success' && result) {
    elements.textarea.readOnly = false;
    elements.submitBtn.disabled = false;
    elements.resetBtn.disabled = false;
    elements.exampleBtns.forEach(btn => (btn.disabled = false));
    elements.submitBtnText.textContent = '감성 분석하기';

    elements.resultCard.setAttribute('aria-busy', 'false');

    const config = SENTIMENT_MAP[result.sentiment] || SENTIMENT_MAP.neutral;
    setResultCardTheme(elements, config.cardClass);
    setBearExpression(elements, result.sentiment);
    switchPanel(elements, 'success');

    // 성공 데이터 바인딩
    elements.sentimentLabel.textContent = config.label;
    elements.sentimentLabel.className = `sentiment-label ${result.sentiment}`;

    const confidence = Math.min(Math.max(result.confidence, 0), 100);
    elements.confidenceValue.textContent = `${confidence}%`;
    elements.confidenceBarFill.style.width = `${confidence}%`;

    elements.sentimentReason.textContent = result.reason;

    // DB 저장 실패 여부 안내 (성공 결과는 유지됨)
    elements.storageWarning.hidden = storageStatus !== 'failed';

    // 스크린리더 및 키보드 사용자를 위해 결과 헤딩에 포커스 이동
    elements.sentimentLabel.focus();
    return;
  }

  // 4. 에러 발생 상태 (error)
  if (status === 'error') {
    elements.textarea.readOnly = false;
    elements.submitBtn.disabled = false;
    elements.resetBtn.disabled = false;
    elements.exampleBtns.forEach(btn => (btn.disabled = false));
    elements.submitBtnText.textContent = '감성 분석하기';

    elements.resultCard.setAttribute('aria-busy', 'false');
    setResultCardTheme(elements, 'state-error');
    setBearExpression(elements, 'idle');
    switchPanel(elements, 'error');

    elements.errorMessage.textContent = error?.message || '처리 중 문제가 생겼어요. 다시 시도해 주세요.';

    // 재시도 가능한 오류인 경우에만 '다시 시도' 버튼 활성화
    if (error?.retryable) {
      elements.retryBtn.hidden = false;
      elements.retryBtn.disabled = false;
    } else {
      elements.retryBtn.hidden = true;
    }
  }
}

