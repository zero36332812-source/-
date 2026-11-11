// ==============================================================================
// public/js/app.js
// 클라이언트 메인 애플리케이션 진입점 및 이벤트 제어기
// ==============================================================================
// 화면 상태 전이(idle -> editing -> loading -> success / error)를 단일 지점에서 관리하고
// 사용자의 키보드 및 클릭 이벤트를 바인딩합니다.
// ==============================================================================

import { countCharacters, validateInput } from './validation.js';
import { getElements, updateCharCount, showInputError, renderApp } from './ui.js';
import { analyzeSentiment } from './api.js';

// 고정 예시 문장 데이터 (지침 문서 03-frontend-behavior.md 기준)
const EXAMPLES = {
  happy: '오늘 친구와 오랜만에 만나서 정말 즐거웠어요.',
  sad: '기대했던 약속이 취소되어 많이 속상해요.',
  neutral: '회의는 내일 오후 세 시에 시작합니다.'
};

// 애플리케이션 단일 상태 객체
const state = {
  status: 'idle',        // 'idle' | 'editing' | 'loading' | 'success' | 'error'
  result: null,          // { sentiment, confidence, reason }
  error: null,           // { code, message, retryable }
  storageStatus: null,   // 'saved' | 'failed'
  activeRequestId: 0     // 브라우저 내부 요청 순번 관리 (레이스 컨디션 방지)
};

// DOM 요소 취득
const elements = getElements();

// 한글 조합(IME) 상태 플래그
let isComposing = false;

/**
 * 상태 변경 및 화면 갱신 헬퍼 함수
 */
function setState(newState) {
  Object.assign(state, newState);
  renderApp(elements, state);
}

/**
 * 감성 분석 제출 처리 핸들러
 */
async function handleSubmit(event) {
  if (event) {
    event.preventDefault();
  }

  // 1. 이미 분석 중이거나 한글 조합 중인 경우 중복 제출 방지
  if (state.status === 'loading' || isComposing) {
    return;
  }

  const rawText = elements.textarea.value;

  // 2. 클라이언트 입력 유효성 검증
  const validation = validateInput(rawText);
  if (!validation.valid) {
    showInputError(elements, validation.message);
    elements.textarea.focus();
    return;
  }

  // 유효성 검사 통과 시 에러 메시지 제거
  showInputError(elements, null);

  // 3. 로딩 상태 전환 및 요청 고유 순번 증가
  const currentRequestId = ++state.activeRequestId;
  setState({
    status: 'loading',
    result: null,
    error: null,
    storageStatus: null
  });

  // 4. 서버 API 호출
  const response = await analyzeSentiment(validation.normalizedText);

  // 다른 최신 요청이 이미 발생했으면 이전 응답 무시 (Race condition 방지)
  if (currentRequestId !== state.activeRequestId) {
    return;
  }

  // 5. 결과에 따른 상태 반영
  if (response.ok) {
    setState({
      status: 'success',
      result: response.data,
      storageStatus: response.meta?.storage || 'saved',
      error: null
    });
  } else {
    setState({
      status: 'error',
      result: null,
      error: response.error,
      storageStatus: null
    });
  }
}

/**
 * 전체 입력 내용 및 상태 초기화 핸들러
 */
function handleReset() {
  if (state.status === 'loading') return;

  elements.textarea.value = '';
  updateCharCount(elements, 0);
  showInputError(elements, null);

  setState({
    status: 'idle',
    result: null,
    error: null,
    storageStatus: null,
    activeRequestId: ++state.activeRequestId
  });

  elements.textarea.focus();
}

/**
 * 예시 문장 버튼 클릭 핸들러
 */
function handleExampleClick(key) {
  if (state.status === 'loading') return;

  const exampleText = EXAMPLES[key];
  if (!exampleText) return;

  elements.textarea.value = exampleText;
  const count = countCharacters(exampleText);
  updateCharCount(elements, count);
  showInputError(elements, null);

  setState({
    status: 'editing',
    result: null,
    error: null,
    storageStatus: null
  });

  elements.textarea.focus();
}

/**
 * 이벤트 리스너 등록 초기화 함수
 */
function initEventListeners() {
  // 1. 폼 제출 이벤트
  elements.form.addEventListener('submit', handleSubmit);

  // 2. 다시 시도 버튼 이벤트
  elements.retryBtn.addEventListener('click', () => {
    handleSubmit();
  });

  // 3. 지우기 버튼 이벤트
  elements.resetBtn.addEventListener('click', handleReset);

  // 4. 예시 버튼 클릭 이벤트
  elements.exampleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const exampleType = btn.getAttribute('data-example');
      handleExampleClick(exampleType);
    });
  });

  // 5. 텍스트 입력 시 실시간 글자 수 카운팅 및 화면 상태 갱신
  elements.textarea.addEventListener('input', () => {
    const count = countCharacters(elements.textarea.value);
    updateCharCount(elements, count);
    showInputError(elements, null);

    // 사용자가 한 글자라도 수정하면 이전 분석 결과 및 에러를 감추고 editing 상태로 전환
    if (state.status === 'success' || state.status === 'error') {
      setState({
        status: 'editing',
        result: null,
        error: null,
        storageStatus: null
      });
    }
  });

  // 한글 조합(IME) 감지
  elements.textarea.addEventListener('compositionstart', () => {
    isComposing = true;
  });
  elements.textarea.addEventListener('compositionend', () => {
    isComposing = false;
  });

  // 6. 단축키 지원 (Ctrl + Enter 또는 Cmd + Enter로 빠른 분석 제출)
  elements.textarea.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      if (!isComposing) {
        event.preventDefault();
        handleSubmit();
      }
    }
  });
}

// 애플리케이션 시작
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  renderApp(elements, state);
});

