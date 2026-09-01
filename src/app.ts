import { Hono } from "hono";
import { classifyRequest, googleSheetLogForwarder } from "./logging/google-sheet.js";
import { vendorRoutes } from "./shared/routes.js";

export const app = new Hono();

export function isDockerHealthCheck(method: string, pathname: string, marker?: string): boolean {
  return method === "GET" && pathname === "/" && marker === "docker";
}

// ==========================================
// [헬퍼 함수] 로그 출력용 한국 시간(KST) 포맷터
// 서버 / Docker timezone은 변경하지 않음
// ==========================================
function getKstTimestamp(): string {
  const now = new Date();

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const getPart = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";

  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");
  const minute = getPart("minute");
  const second = getPart("second");

  const milliseconds = String(now.getMilliseconds()).padStart(3, "0");

  return `${year}-${month}-${day} ${hour}:${minute}:${second}.${milliseconds}`;
}

// ==========================================
// [미들웨어] 요청 / 응답 인터셉트 및 로그 기록
// ==========================================
app.use("*", async (c, next) => {
  const startTime = Date.now();

  const method = c.req.method;
  const url = c.req.url;

  // ------------------------------------------
  // 1. Request Body 파싱
  // ------------------------------------------
  let reqBody: unknown = null;

  try {
    const contentType = c.req.header("content-type") ?? "";

    if (contentType.includes("application/json")) {
      reqBody = await c.req.raw.clone().json();
    } else if (
      contentType.includes("text/") ||
      contentType.includes("application/x-www-form-urlencoded")
    ) {
      reqBody = await c.req.raw.clone().text();
    }
  } catch {
    reqBody = "[Parsing Error or Empty Body]";
  }

  // 실제 라우터 / 미들웨어 실행
  await next();

  // Docker가 전용 헤더와 함께 보내는 내부 헬스체크는 접근 로그에서 제외한다.
  // 일반 사용자의 GET / 요청은 동일하게 기록된다.
  if (isDockerHealthCheck(method, new URL(url).pathname, c.req.header("x-health-check"))) return;

  // ------------------------------------------
  // 2. Response Body 파싱
  // ------------------------------------------
  const duration = Date.now() - startTime;

  const res = c.res;

  let resBody: unknown = null;

  try {
    const resContentType = res.headers.get("content-type") ?? "";

    if (resContentType.includes("application/json")) {
      resBody = await res.clone().json();
    } else if (resContentType.includes("text/")) {
      resBody = await res.clone().text();
    }
  } catch {
    resBody = "[Parsing Error or Binary Data]";
  }

  // ------------------------------------------
  // 3. 한국 시간 기준 로그 생성
  // ------------------------------------------
  const timestamp = getKstTimestamp();

  const logData = {
    timestamp,

    method,
    url,

    status: res.status,

    // 숫자로 저장하는 편이 추후 분석에 유리함
    durationMs: duration,

    request: {
      headers: {
        "user-agent": c.req.header("user-agent"),
        "content-type": c.req.header("content-type"),
      },

      body: reqBody,
    },

    response: {
      body: resBody,
    },
  };

  // Docker stdout 로그
  console.log(JSON.stringify(logData));

  // 외부 로그 적재는 응답 처리와 분리된 큐에서 비동기로 수행한다.
  googleSheetLogForwarder.enqueue({
    timestamp,
    method,
    url,
    status: res.status,
    "구분": classifyRequest(method, url),
    durationMs: duration,
    "user-agent": c.req.header("user-agent") ?? null,
    "request.body": reqBody,
    "response.body": resBody,
  });
});

// ==========================================
// 라우트 정의
// ==========================================

app.get("/", (c) =>
  c.json({
    service: "forest-vendor-proxy",
    status: "ok",
  }),
);

app.route("/", vendorRoutes);

// ==========================================
// 404
// ==========================================

app.notFound((c) =>
  c.json(
    {
      error: {
        code: "NOT_FOUND",
        message: "지원하지 않는 경로입니다.",
      },
    },
    404,
  ),
);

// ==========================================
// Error Handler
// ==========================================

app.onError((error, c) =>
  c.json(
    {
      error: {
        code: "PROCESSING_FAILURE",
        message: error.message,
        retryable: true,
      },
    },
    502,
  ),
);
