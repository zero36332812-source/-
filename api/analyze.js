// ==============================================================================
// api/analyze.js
// Vercel Serverless Function 엔드포인트 진입점 (/api/analyze)
// ==============================================================================
// 01-project-setup.md 지침 4항을 준수하여 Web 표준 Request/Response 인터페이스로 내보냅니다.
// ==============================================================================

import { createAnalyzeHandler } from '../src/server/analyze-handler.js';
import { productionDependencies } from '../src/server/production-dependencies.js';

export default {
  fetch: createAnalyzeHandler(productionDependencies)
};

