import { cache } from "react";
import { NextResponse } from "next/server";
import { createClient } from "./supabase/server";
import { prisma } from "./db";
import { hasAtLeast, type Role } from "./roles";
import { isSuperadminEmail } from "./superadmin";

// getAuthUser가 조회하는 User 필드 — 읽기/생성 경로에서 공유
const AUTH_USER_SELECT = {
  id: true,
  nickname: true,
  avatarUrl: true,
  supabaseId: true,
  membershipStatus: true,
  age: true,
  approvedAge: true,
  role: true,
  deletedAt: true,
  startPromptSeenAt: true,
} as const;

export type AuthUser = {
  supabaseId: string;
  dbUserId: string;
  email: string | null; // Supabase 세션 이메일 — superadmin 부트스트랩 판정에 사용
  nickname: string | null;
  avatarUrl: string | null;
  membershipStatus: string; // none | pending | approved | rejected
  age: number | null; // 가입신청서의 나이 — pending 중 재제출로 변경 가능(미확정)
  approvedAge: number | null; // 승인 시점 고정 나이 — 집단(러비아/유디코/엘리온) 판정의 불변 근거
  role: Role; // 전역 등급. 동아리장은 여기 없음(소유 동아리에서 파생). superadmin은 env로 승격
  startPromptSeenAt: Date | null; // 승인 후 첫 진입의 /start 안내 완료 시각 — null이면 홈에서 1회 안내
};

/**
 * 서버 컴포넌트 / API Route에서 현재 로그인 유저 반환
 * - 카카오 첫 로그인 시 Prisma User 자동 생성
 * - 비로그인이면 null 반환 (에러가 아님 — 익명 허용 흐름)
 *
 * 성능: 기존 유저는 findUnique(읽기)로만 처리하고, 없을 때(첫 로그인)만
 * upsert로 멱등 생성한다. 매 요청 no-op 쓰기 트랜잭션을 없애기 위함.
 * React cache()로 감싸 한 요청 내 중복 호출(미들웨어/라우트/레이아웃)을 1회로 합친다.
 *
 * 인증 검증: getUser()는 매 호출마다 Supabase Auth 서버로 네트워크 왕복(원격 JWT 검증)을 한다.
 * getClaims()는 비대칭 서명키(ES256/RS256) 환경에서 JWKS를 캐시해 JWT를 로컬에서 검증하므로
 * 인증 경로의 네트워크 홉을 제거한다(대칭 HS256이면 내부적으로 getUser로 폴백 — 무회귀).
 * 모든 인증 API/서버 컴포넌트의 TTFB가 왕복 1회만큼 빨라진다.
 */
export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (error || !claims?.sub) return null;

    const supabaseId = claims.sub;
    const email = (typeof claims.email === "string" ? claims.email : null) as string | null;

    // 읽기 우선 — 기존 유저는 쓰기 없이 조회만
    let dbUser = await prisma.user.findUnique({
      where: { supabaseId },
      select: AUTH_USER_SELECT,
    });

    // 탈퇴한 행은 절대 되살리지 않는다(fail-closed).
    // 탈퇴 시 supabaseId를 'withdrawn:<id>'로 툼스톤하므로(lib/withdrawal.ts) 위 조회가
    // 탈퇴 행을 반환하는 일은 원래 없다. 만약 반환된다면 데이터가 계약을 어긴 상태이므로,
    // deletedAt을 지워 복구하지 말고(=DB CHECK 위반으로 로그인 자체가 깨진다)
    // 없는 것으로 보고 아래에서 새 행을 만든다. 재가입은 /join 절차를 처음부터 다시 밟는다.
    if (dbUser?.deletedAt) dbUser = null;

    // 첫 로그인 — 멱등 생성 (동시 첫로그인 race 안전을 위해 upsert)
    if (!dbUser) {
      // JWT의 user_metadata(카카오 표시명/아바타)에서 폴백값을 읽는다.
      const meta = (claims.user_metadata ?? {}) as { full_name?: string; avatar_url?: string };
      const fallbackNickname = meta.full_name ?? email?.split("@")[0] ?? null;

      dbUser = await prisma.user.upsert({
        where: { supabaseId },
        update: {},
        create: {
          supabaseId,
          nickname: fallbackNickname,
          avatarUrl: meta.avatar_url ?? null,
        },
        select: AUTH_USER_SELECT,
      });
    }

    return {
      supabaseId,
      dbUserId: dbUser.id,
      email,
      nickname: dbUser.nickname,
      avatarUrl: dbUser.avatarUrl,
      membershipStatus: dbUser.membershipStatus,
      age: dbUser.age,
      approvedAge: dbUser.approvedAge,
      startPromptSeenAt: dbUser.startPromptSeenAt,
      // 슈퍼관리자 이메일은 DB 값과 무관하게 항상 superadmin으로 승격(첫 로그인 부트스트랩 포함).
      role: isSuperadminEmail(email) ? "superadmin" : (dbUser.role as Role),
    };
  } catch {
    return null;
  }
});

/**
 * 공동체 활동(동아리 개설·가입신청, 기도 올리기 등 쓰기)은 관리자 승인 멤버만.
 * 미승인이면 403 응답을 반환 — 클라이언트는 code로 /join 안내.
 */
export function membershipGate(user: AuthUser): NextResponse | null {
  if (hasAtLeast(user.role, "staff")) return null; // 운영진 이상은 멤버십 상태와 무관하게 통과
  if (user.membershipStatus === "approved") return null;
  return NextResponse.json(
    {
      ok: false,
      code: "membership_required",
      membershipStatus: user.membershipStatus,
      error:
        user.membershipStatus === "pending"
          ? "가입 승인을 기다리는 중이에요. 승인되면 바로 참여할 수 있어요."
          : "꿈꾸는교회 청년부 멤버 확인 후 참여할 수 있어요. 가입 신청을 먼저 해주세요.",
    },
    { status: 403 },
  );
}

/**
 * 역할 게이트 — API Route에서 최소 등급(min) 미만이면 401/403 반환, 충족하면 null.
 * membershipGate와 같은 모양. 사용: const gate = roleGate(user, "admin"); if (gate) return gate;
 */
export function roleGate(user: AuthUser | null, min: Role): NextResponse | null {
  if (!user) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  if (!hasAtLeast(user.role, min)) {
    return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 403 });
  }
  return null;
}

/**
 * 카카오 로그인 URL 생성 (클라이언트 컴포넌트에서 직접 호출)
 * redirectTo: 로그인 후 돌아올 경로
 */
export function getKakaoLoginUrl(redirectTo: string = "/"): string {
  const params = new URLSearchParams({
    provider: "kakao",
    redirectTo: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback?next=${encodeURIComponent(redirectTo)}`,
  });
  return `/api/auth/login?${params.toString()}`;
}
