// ==============================================================================
// src/server/production-dependencies.js
// 실제 운영 환경 의존성(OpenAI, Supabase) 주입 및 지연 초기화 모듈
// ==============================================================================
// 01-project-setup.md 지침에 따라 모듈 임포트 시점에 에러가 발생하지 않도록
// 팩토리 및 지연 초기화 방식으로 구성합니다.
// ==============================================================================

import { createOpenAIAdapter } from './openai-client.js';
import { createSupabaseClient } from './supabase-client.js';
import { createAnalysisRepository } from './analysis-repository.js';

export const productionDependencies = {
  /**
   * OpenAI 어댑터를 취득합니다. 환경변수가 없으면 null을 반환합니다.
   */
  getAIAdapter() {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL || 'gpt-5.4-mini-2026-03-17';

    if (!apiKey || !apiKey.trim() || apiKey === 'replace_with_openai_project_key') {
      return null;
    }

    try {
      return createOpenAIAdapter({ apiKey, model });
    } catch (e) {
      return null;
    }
  },

  /**
   * Supabase 저장소를 취득합니다.
   */
  getRepository() {
    const url = process.env.SUPABASE_URL;
    const secretKey = process.env.SUPABASE_SECRET_KEY;

    if (!url || !secretKey || url.includes('your-project') || secretKey.includes('replace_with')) {
      return createAnalysisRepository(null);
    }

    try {
      const client = createSupabaseClient({ url, secretKey });
      return createAnalysisRepository(client);
    } catch (e) {
      return createAnalysisRepository(null);
    }
  }
};

