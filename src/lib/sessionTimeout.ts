/**
 * 자동 로그아웃 정책 — 마지막 '사용자 조작' 이후 얼마나 지났는지 하나의 시계로 재고,
 * 그 시계를 두 개의 서로 다른 기준선에 대어 본다.
 *
 *  1) 일반(7일): 넘으면 세션을 끊는다. 청년부 커뮤니티 앱이라 매번 로그인시키면
 *     알림 받고 들어오는 동선이 통째로 망가진다 — Discord·Slack급 활동성을 가정한다.
 *  2) 운영(30분): /manage·/admin처럼 실명·연락처 같은 PII가 뜨는 화면만 따로 짧게 본다.
 *     넘어도 세션을 끊지는 않고, 그 화면에 들어갈 때 구글 재인증만 요구한다(단계 승격).
 *     끊어버리면 점심 먹고 온 운영진이 일반 세션까지 잃는데, 지키려던 건 "PII 화면이
 *     자리 비운 사이 열려 있는 것"이지 세션 그 자체가 아니다.
 *
 * 앱을 닫아둔 시간도 조작이 없는 시간이므로 같은 시계로 계산된다("앱 끈 지 N시간"과 동치).
 *
 * 되감기는 오직 /api/auth/heartbeat POST 뿐이고, 그 POST는 클라이언트가 실제 입력 이벤트
 * (터치·클릭·키·휠)에서만 보낸다. 하단 탭바의 45초 배지 폴링처럼 사람이 만들지 않은
 * 백그라운드 요청은 절대 이 시계를 되감지 않는다 — 되감았다면 앱을 켜둔 것만으로 유휴
 * 판정이 영원히 성립하지 않는다.
 *
 * 로그인 시각 기준의 '절대 수명'은 일부러 두지 않았다. 유휴 창과 같은 길이로 잡으면
 * lastActive >= sessionStart라 절대 만료가 언제나 먼저 걸려 유휴 규칙이 死문이 되고,
 * 한창 쓰고 있는 사람을 작업 도중에 끊게 된다.
 *
 * 시각은 httpOnly 쿠키에 epoch(ms) 문자열로 담긴다. 클라이언트 JS가 못 읽고 못 쓰므로
 * 남은 시간은 heartbeat 응답으로만 알려준다. 다만 쿠키를 지우는 것 자체는 막을 수 없는데,
 * 지우면 아래 "seed" 판정으로 시계가 새로 시작한다 — 자기 세션을 자기가 연장하는 것뿐이라
 * 권한 상승이 아니고(운영 화면은 재인증을 따로 받는다), 실제 보안 경계는 Supabase JWT 만료다.
 */

/** 일반 화면의 유휴 한계. 넘으면 로그아웃. */
export const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

/** 운영 화면(PII)의 유휴 한계. 넘으면 로그아웃이 아니라 재인증. */
export const ELEVATED_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export const LAST_ACTIVE_COOKIE = "dv-la";

/**
 * 쿠키 자체의 수명은 정책 창보다 넉넉히 길게 잡는다. 쿠키가 만료로 사라지는 것과
 * "정책 시행 전부터 로그인해 있던 세션이라 쿠키가 애초에 없는 것"을 구분할 수 없게 되면,
 * 전자를 후자로 오인해 만료된 세션을 그대로 통과시키게 된다. 판정은 항상 타임스탬프 비교로만 한다.
 */
const COOKIE_MAX_AGE_SECONDS = 90 * 24 * 60 * 60;

export type SessionTimeoutVerdict =
  /** 아직 유효 — 만료 시각을 함께 돌려준다(클라이언트 타이머 예약용). */
  | { status: "ok"; idleDeadline: number; elevatedDeadline: number }
  /** 타임스탬프 쿠키가 없거나 깨졌다 — 지금을 기준으로 새로 심는다(fail-open). */
  | { status: "seed" }
  | { status: "timeout" };

/** epoch(ms) 문자열만 통과. 음수·소수·공백·오버플로는 전부 "없음"으로 본다. */
function parseTimestamp(raw: string | null | undefined): number | null {
  if (!raw || !/^\d{1,15}$/.test(raw)) return null;
  const ms = Number(raw);
  return Number.isSafeInteger(ms) && ms > 0 ? ms : null;
}

/**
 * 쿠키 하나와 현재 시각만으로 세션 판정. 순수 함수 — 미들웨어(edge)와 heartbeat 라우트가
 * 같은 규칙을 쓰도록 한 곳에 모아둔다. 한쪽만 느슨하면 그쪽이 우회로가 된다.
 *
 * 미래 시각(서버 간 시계 어긋남)은 만료로 치지 않는다 — 어긋남 때문에 멀쩡한 세션을
 * 끊는 쪽이, 몇 초 늦게 끊는 쪽보다 훨씬 나쁘다.
 */
export function evaluateSessionTimeout(input: {
  lastActive: string | null | undefined;
  now: number;
}): SessionTimeoutVerdict {
  const lastActive = parseTimestamp(input.lastActive);
  if (lastActive === null) return { status: "seed" };
  if (input.now - lastActive >= IDLE_TIMEOUT_MS) return { status: "timeout" };
  return {
    status: "ok",
    idleDeadline: lastActive + IDLE_TIMEOUT_MS,
    elevatedDeadline: lastActive + ELEVATED_IDLE_TIMEOUT_MS,
  };
}

/**
 * 실명·연락처 같은 PII가 뜨는 운영 화면인지 — 여기만 30분 기준을 적용한다.
 * /admin/login은 진입 안내 페이지라 제외해야 한다(재인증 목적지가 다시 재인증을 요구하면 맴돈다).
 */
export function isElevatedPath(pathname: string): boolean {
  if (pathname === "/admin/login") return false;
  return (
    pathname === "/manage" ||
    pathname.startsWith("/manage/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/api/manage/") ||
    pathname.startsWith("/api/admin/")
  );
}

/** 타임스탬프 쿠키 공통 옵션 — JS가 못 읽도록 httpOnly. */
export function timestampCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  };
}

export const SESSION_TIMEOUT_CODE = "session_timeout";
export const REAUTH_REQUIRED_CODE = "reauth_required";

export const SESSION_TIMEOUT_MESSAGE =
  "오래 활동이 없어 자동으로 로그아웃되었어요. 다시 로그인해주세요.";

export const REAUTH_REQUIRED_MESSAGE =
  "운영 화면은 30분 이상 자리를 비우면 다시 로그인해야 열려요.";
