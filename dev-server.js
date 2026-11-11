// ==============================================================================
// dev-server.js
// 로컬 개발 전용 경량 Node.js 서버 (Windows symlink 권한 오류 완벽 해결)
// ==============================================================================
// 1. public/ 폴더 안의 정적 파일(HTML, CSS, JS)을 서비스합니다.
// 2. /api/analyze 요청을 api/analyze.js 핸들러로 라우팅합니다.
// 3. .env.local 환경변수를 그대로 사용합니다.
// ==============================================================================

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import analyzeModule from './api/analyze.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// MIME 타입 매핑
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // 1. API 엔드포인트 라우팅 (/api/analyze)
  if (pathname === '/api/analyze') {
    try {
      // Node.js IncomingMessage를 Web 표준 Request 객체로 변환
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const bodyBuffer = Buffer.concat(chunks);

      const webHeaders = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value) {
          if (Array.isArray(value)) {
            value.forEach(v => webHeaders.append(key, v));
          } else {
            webHeaders.set(key, value);
          }
        }
      }

      const webRequest = new Request(`http://localhost:${PORT}${req.url}`, {
        method: req.method,
        headers: webHeaders,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : bodyBuffer
      });

      // api/analyze.js 핸들러 실행
      const webResponse = await analyzeModule.fetch(webRequest);

      // Web Response를 Node.js ServerResponse로 전달
      res.statusCode = webResponse.status;
      webResponse.headers.forEach((val, key) => {
        res.setHeader(key, val);
      });

      const responseBody = await webResponse.text();
      res.end(responseBody);
    } catch (err) {
      console.error('[API Error]:', err);
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({
        ok: false,
        error: { code: 'INTERNAL_ERROR', message: '로컬 서버 처리 중 문제가 발생했습니다.', retryable: true }
      }));
    }
    return;
  }

  // 2. 정적 파일 서비스 (public/)
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // 디렉토리 트래버설 보안 방지
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  마음결 (Maeumgyeol) 로컬 개발 서버가 실행되었습니다!`);
  console.log(`  👉 접속 주소: http://localhost:${PORT}`);
  console.log(`  👉 종료하려면 터미널에서 Ctrl + C를 누르세요.`);
  console.log(`======================================================\n`);
});

