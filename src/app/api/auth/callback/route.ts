import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/db";
import { LAST_ACTIVE_COOKIE, timestampCookieOptions } from "@/lib/sessionTimeout";
import { NextRequest, NextResponse } from "next/server";

/**
 * Supabase OAuth 콜백 처리
 * 카카오 로그인 후 Supabase가 이 URL로 리다이렉트
 * code를 세션으로 교환한 뒤 next 파라미터 경로로 이동
 */
/**
 * next 파라미터 오픈 리다이렉트 방어 — 우리 사이트 내부 경로만 허용한다.
 * 단일 '/'로 시작하는 상대경로만 통과시켜 //evil.com, /\evil.com,
 * @evil.com, .evil.com, https://evil.com 같은 외부 이동을 모두 차단.
 */
function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/")) return "/";
  if (raw.startsWith("//") || raw.startsWith("/\\")) return "/";
  return raw;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // 자동 로그아웃의 유휴 시계를 로그인 시각에 맞춰 출발시킨다. 여기서 심지 않으면
      // 첫 요청에서 미들웨어가 "정책 시행 전 세션"으로 보고 시드하게 되는데, 그러면
      // 실제 로그인 시각이 아니라 첫 페이지 이동 시각이 기준이 된다.
      const startedAt = Date.now();
      const redirectWithSession = (url: string) => {
        const res = NextResponse.redirect(url);
        res.cookies.set(LAST_ACTIVE_COOKIE, String(startedAt), timestampCookieOptions());
        return res;
      };

      // 헤더의 일반 '로그인' 버튼(next 미지정 → '/')으로 들어온 경우에 한해:
      // 미가입(none/rejected) 유저는 가입 신청 화면으로 안내한다.
      // 특정 페이지에서 로그인한 경우(next!=='/')는 그 페이지가 자체적으로 가입 안내를 하므로 원래 목적지로 보낸다.
      if (next === "/") {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const dbUser = await prisma.user.findUnique({
            where: { supabaseId: user.id },
            select: { membershipStatus: true },
          });
          const status = dbUser?.membershipStatus ?? "none";
          if (status === "none" || status === "rejected") {
            return redirectWithSession(`${origin}/join?welcome=1`);
          }
        }
      }
      return redirectWithSession(`${origin}${next}`);
    }
  }

  // 에러 시 홈으로 (추후 에러 페이지로 교체 가능)
  return NextResponse.redirect(`${origin}/?auth_error=1`);
}
