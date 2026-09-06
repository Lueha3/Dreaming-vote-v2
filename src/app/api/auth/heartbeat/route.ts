import { NextRequest, NextResponse } from "next/server";

import { rateLimitResponse, getClientIp } from "@/lib/rateLimit";
import {
  ELEVATED_IDLE_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  LAST_ACTIVE_COOKIE,
  SESSION_TIMEOUT_CODE,
  SESSION_TIMEOUT_MESSAGE,
  evaluateSessionTimeout,
  timestampCookieOptions,
} from "@/lib/sessionTimeout";

/**
 * 세션 유휴 시계 — 클라이언트(SessionTimeoutGuard)와 주고받는 유일한 창구.
 *
 *   GET  … 남은 시간만 읽는다. 시계를 되감지 않는다.
 *   POST … 사용자가 실제로 조작했다는 신호. 시계를 now로 되감는다.
 *
 * 이 라우트는 /api/auth/* 라 미들웨어 matcher에서 제외되어 있다. 즉 미들웨어의 만료 검사를
 * 거치지 않으므로, 이미 만료된 세션이 여기로 들어와 스스로를 되살리지 못하도록 같은 판정을
 * 이 안에서 한 번 더 한다(lib/sessionTimeout.ts의 공용 규칙).
 */

/** 만료 응답 — 쿠키까지 걷어내 다음 요청이 곧장 비로그인으로 떨어지게 한다. */
function timedOut(req: NextRequest) {
  const res = NextResponse.json(
    { ok: false, code: SESSION_TIMEOUT_CODE, error: SESSION_TIMEOUT_MESSAGE },
    { status: 401 },
  );
  for (const cookie of req.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) res.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
  }
  res.cookies.set(LAST_ACTIVE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

function handle(req: NextRequest, extend: boolean) {
  // 로그인 쿠키가 없으면 되감을 세션 자체가 없다 — 쓸데없는 타임스탬프 쿠키를 남기지 않는다.
  const loggedIn = req.cookies.getAll().some((c) => c.name.startsWith("sb-"));
  if (!loggedIn) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }

  const now = Date.now();
  const verdict = evaluateSessionTimeout({
    lastActive: req.cookies.get(LAST_ACTIVE_COOKIE)?.value,
    now,
  });

  if (verdict.status === "timeout") return timedOut(req);

  // 조회(GET)는 시계를 건드리지 않는다. 단, 쿠키가 아예 없던 세션(seed)은 지금을 기준으로
  // 심어줘야 이후 판정이 성립하므로 그때만 쓴다.
  if (verdict.status === "ok" && !extend) {
    return NextResponse.json({
      ok: true,
      idleDeadline: verdict.idleDeadline,
      elevatedDeadline: verdict.elevatedDeadline,
    });
  }

  const res = NextResponse.json({
    ok: true,
    idleDeadline: now + IDLE_TIMEOUT_MS,
    elevatedDeadline: now + ELEVATED_IDLE_TIMEOUT_MS,
  });
  res.cookies.set(LAST_ACTIVE_COOKIE, String(now), timestampCookieOptions());
  return res;
}

/** 남은 시간 조회 — 탭 복귀·최초 마운트처럼 "사용자 조작이 아닌" 시점에서 쓴다. */
export async function GET(req: NextRequest) {
  return handle(req, false);
}

/** 사용자 조작 신호 — 유휴 시계를 되감는다. */
export async function POST(req: NextRequest) {
  // 클라이언트가 1분에 1회로 스로틀하지만, 그 스로틀은 우리 코드일 뿐 계약이 아니다.
  const rl = rateLimitResponse(`heartbeat:${getClientIp(req)}`, { windowMs: 60_000, max: 120 });
  if (rl) return rl;
  return handle(req, true);
}
