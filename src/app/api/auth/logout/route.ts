import { createClient } from "@/lib/supabase/server";
import { LAST_ACTIVE_COOKIE } from "@/lib/sessionTimeout";
import { NextResponse } from "next/server";

export async function POST() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const base =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  const res = NextResponse.redirect(new URL("/", base));
  // 자동 로그아웃 시계도 함께 정리 — 남겨두면 다음 로그인 전까지 의미 없는 값이 굴러다닌다.
  res.cookies.set(LAST_ACTIVE_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
