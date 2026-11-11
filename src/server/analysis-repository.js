// ==============================================================================
// src/server/analysis-repository.js
// 감성 분석 메트릭 저장소 (Repository)
// ==============================================================================
// 05-database-security.md 지침을 엄격히 준수합니다.
// 1. 입력 원문 및 분석 이유는 절대 저장하지 않습니다.
// 2. 2초 타임아웃을 적용하며, 저장이 실패하더라도 분석 결과는 보존되고 'failed' 상태만 반환합니다.
// ==============================================================================

const DB_TIMEOUT_MS = 2000;

export function createAnalysisRepository(supabaseClient) {
  return {
    /**
     * 분석 완료 메트릭을 데이터베이스에 저장합니다.
     * @param {object} params
     * @param {string} params.requestId - 요청 UUID
     * @param {string} params.sentiment - 감성 라벨
     * @param {number} params.confidence - 신뢰도 (0~100)
     * @param {number} params.inputLength - 글자 수
     * @param {string} params.model - 모델 식별자
     * @param {number} params.latencyMs - 서버 처리 소요 시간 (ms)
     * @returns {Promise<'saved' | 'failed'>}
     */
    async saveEvent({ requestId, sentiment, confidence, inputLength, model, latencyMs }) {
      if (!supabaseClient) {
        return 'failed';
      }

      try {
        const queryPromise = supabaseClient
          .from('analysis_events')
          .insert({
            request_id: requestId,
            sentiment,
            confidence,
            input_length: inputLength,
            model,
            latency_ms: latencyMs
          });

        // 2초 타임아웃 래핑
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('DB Timeout')), DB_TIMEOUT_MS);
        });

        const result = await Promise.race([queryPromise, timeoutPromise]);

        if (result && result.error) {
          console.error(`[DB Error - ${requestId}]:`, result.error.message);
          return 'failed';
        }

        return 'saved';
      } catch (err) {
        console.error(`[DB Timeout/Exception - ${requestId}]:`, err?.message || err);
        return 'failed';
      }
    }
  };
}

