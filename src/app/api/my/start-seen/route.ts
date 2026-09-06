import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasAtLeast } from "@/lib/roles";

/**
 * POST /api/my/start-seen — 성격유형 고르기(/start) 첫 안내를 봤다고 기록.
 * 홈(/)은 승인 멤버의 startPromptSeenAt이 null이면 /start로 보내는데(page.tsx),
 * 그 소모 기록을 여기서 남긴다. /start가 실제 브라우저에 마운트될 때만 호출되므로
 * RSC 프리페치로는 절대 소모되지 않는다.
 *
 * 승인 전(pending 등) 방문은 기록하지 않는다 — 승인 후 첫 진입 안내가 그대로 살아있어야
 * "가입 승인 → 첫 로그인 → 성격유형 고르기" 흐름이 보장된다.
 */
export async function POST() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }

  const isApprovedMember = hasAtLeast(user.role, "staff") || user.membershipStatus === "approved";
  if (!isApprovedMember) {
    return NextResponse.json({ ok: true, marked: false });
  }

  // 이미 기록돼 있으면 no-op — 최초 시각을 보존한다.
  await prisma.user.updateMany({
    where: { id: user.dbUserId, startPromptSeenAt: null },
    data: { startPromptSeenAt: new Date() },
  });

  return NextResponse.json({ ok: true, marked: true });
}
