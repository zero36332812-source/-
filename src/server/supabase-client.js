// ==============================================================================
// src/server/supabase-client.js
// Supabase 클라이언트 초기화 팩토리
// ==============================================================================
// 05-database-security.md 지침 4항을 준수하여 세션 유지를 끄고
// 서버 전용 secret key로 클라이언트를 생성합니다.
// ==============================================================================

import { createClient } from '@supabase/supabase-js';

/**
 * Supabase 클라이언트를 생성합니다.
 * @param {object} options
 * @param {string} options.url - Supabase 프로젝트 URL
 * @param {string} options.secretKey - Supabase service_role 시크릿 키
 */
export function createSupabaseClient({ url, secretKey }) {
  if (!url || !secretKey) {
    return null;
  }

  return createClient(url.trim(), secretKey.trim(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
}

