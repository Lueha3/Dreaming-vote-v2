import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isHiddenPath } from "@/lib/features";
import {
  LAST_ACTIVE_COOKIE,
  REAUTH_REQUIRED_CODE,
  REAUTH_REQUIRED_MESSAGE,
  SESSION_TIMEOUT_CODE,
  SESSION_TIMEOUT_MESSAGE,
  evaluateSessionTimeout,
  isElevatedPath,
  timestampCookieOptions,
} from "@/lib/sessionTimeout";

export async function middleware(request: NextRequest) {
  // 감춘 기능(광장·성격유형)의 경로는 로그인 여부와 무관하게 여기서 끊는다 — 페이지 파일은
  // 그대로 두되 URL로 직접 들어오는 길을 막는 단일 지점(lib/features.ts).
  if (isHiddenPath(request.nextUrl.pathname)) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ ok: false, error: "지원하지 않는 기능입니다." }, { status: 404 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  const supabaseResponse = NextResponse.next({ request });

  // 인증 쿠키가 전혀 없으면(비로그인·외부 첫 유입) 갱신할 세션도, 검증할 토큰도 없다.
  // 이 경우 getUser()는 어차피 null을 반환하므로 Supabase Auth 왕복을 생략해
  // 모든 공개 페이지의 TTFB에서 불필요한 네트워크 홉을 제거한다.
  const hasSessionCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));
  if (!hasSessionCookie) return supabaseResponse;

  // 자동 로그아웃 집행 지점 — 세션을 갱신하기 '전에' 본다. 만료된 세션을 갱신부터 하면
  // Supabase 토큰이 새로 발급되어, 끊으려던 세션의 수명을 오히려 늘려주게 된다.
  const now = Date.now();
  const verdict = evaluateSessionTimeout({
    lastActive: request.cookies.get(LAST_ACTIVE_COOKIE)?.value,
    now,
  });

  if (verdict.status === "timeout" && !isTimeoutExempt(request)) {
    return timeoutResponse(request);
  }

  // 운영 화면(PII)은 같은 시계를 30분 기준선에 대어 본다. 세션은 살아 있으므로 끊지 않고,
  // 구글 재인증만 받아 시계를 되감는다(로그인에 성공하면 콜백이 dv-la를 새로 심는다).
  if (
    verdict.status === "ok" &&
    now >= verdict.elevatedDeadline &&
    isElevatedPath(request.nextUrl.pathname)
  ) {
    return reauthResponse(request);
  }

  const response = await refreshSession(request);

  // 정책 시행 전부터 로그인해 있던 세션에는 타임스탬프가 없다. 이걸 만료로 보면 배포 순간
  // 전원이 튕기므로, 지금을 시작점으로 심고 통과시킨다(fail-open).
  if (verdict.status === "seed") {
    response.cookies.set(LAST_ACTIVE_COOKIE, String(now), timestampCookieOptions());
  }
  return response;
}

/**
 * 만료 처리에서 빼는 경로. /login으로 보내놓고 거기서 또 만료 판정을 하면 리다이렉트가
 * 맴돈다(응답에서 쿠키를 지우긴 하지만, 그 응답이 도달하기 전 경합을 만들 이유가 없다).
 */
function isTimeoutExempt(request: NextRequest): boolean {
  const { pathname, searchParams } = request.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) return true;
  // 만료 목적지에 이미 도착한 요청은 다시 돌려보내지 않는다. 보통은 만료 응답이 쿠키를
  // 걷어내므로 다음 요청에서 아예 검사에 안 걸리지만, 쿠키가 남는 예외 상황에서
  // 홈이 무한히 자기 자신으로 리다이렉트되는 것만은 막아야 한다.
  return pathname === "/" && searchParams.get("logout") === "idle";
}

/** 만료 응답 — 인증 쿠키를 전부 걷어내고 로그인 화면(또는 API면 401)으로 보낸다. */
function timeoutResponse(request: NextRequest) {
  const isApi = request.nextUrl.pathname.startsWith("/api/");

  let response: NextResponse;
  if (isApi) {
    response = NextResponse.json(
      { ok: false, code: SESSION_TIMEOUT_CODE, error: SESSION_TIMEOUT_MESSAGE },
      { status: 401 },
    );
  } else {
    // 만료되면 로그인 폼이 아니라 방문자 홈(랜딩)으로 보낸다 — 로그아웃된 사람이
    // 처음 보는 화면은 앱의 첫인상이어야지, 맥락 없는 로그인 폼이면 안 된다.
    const home = new URL("/", request.url);
    home.searchParams.set("logout", "idle");
    // 첫 화면은 홈이되, 어디로 가려던 길이었는지는 기억한다. 이게 없으면 푸시 알림을
    // 눌러 들어온 사람이 그 글 대신 랜딩만 보고 끝난다(알림 딥링크가 통째로 증발).
    // 로그인 버튼이 이 값을 이어받아 /api/auth/login?next=... 로 넘긴다.
    const back = request.nextUrl.pathname + request.nextUrl.search;
    if (back !== "/") home.searchParams.set("next", back);
    response = NextResponse.redirect(home);
  }

  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.startsWith("sb-")) response.cookies.set(cookie.name, "", { path: "/", maxAge: 0 });
  }
  response.cookies.set(LAST_ACTIVE_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}

/**
 * 운영 화면 재인증 — 세션은 그대로 두고 구글 로그인만 다시 태운다.
 * 쿠키를 지우지 않는 게 핵심: 지키려는 건 "PII 화면이 자리 비운 사이 열려 있는 것"이지
 * 세션 자체가 아니므로, 재인증만 통과하면 일반 화면은 끊김 없이 이어진다.
 * (/api/auth/login은 prompt=select_account라 계정 선택이 실제 재인증으로 작동한다.)
 */
function reauthResponse(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { ok: false, code: REAUTH_REQUIRED_CODE, error: REAUTH_REQUIRED_MESSAGE },
      { status: 401 },
    );
  }
  const login = new URL("/api/auth/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
  return NextResponse.redirect(login);
}

async function refreshSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options?: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: refresh token 갱신 — 이 호출 없으면 세션이 만료됨.
  // createServerClient()와 이 호출 사이에 로직을 넣지 말 것 (세션 동기화 깨짐).
  //
  // getUser()는 매 요청 Supabase Auth로 네트워크 왕복(원격 JWT 검증)을 한다.
  // getClaims()는 내부적으로 getSession()을 호출해 만료 임박 토큰을 갱신(setAll로 쿠키 반영)하면서,
  // 비대칭 서명키 환경에선 JWT를 로컬 검증한다 — 갱신 동작은 유지하되 매 요청 네트워크 홉을 제거.
  // (대칭 HS256이면 내부적으로 getUser로 폴백하므로 동작 무회귀)
  await supabase.auth.getClaims();

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * 다음 경로를 제외한 모든 요청에서 실행:
     * - _next/static, _next/image : 정적 파일/이미지 최적화
     * - favicon.ico, 이미지 파일 (svg/png/jpg/...)
     * - api/og : OG 이미지 생성 (@vercel/og)
     * - api/auth : OAuth 콜백/로그인/로그아웃 — 자체적으로 세션 쿠키를 관리하므로
     *   토큰 갱신 미들웨어와 충돌하지 않도록 제외
     */
    "/((?!_next/static|_next/image|favicon.ico|api/og|api/auth|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
