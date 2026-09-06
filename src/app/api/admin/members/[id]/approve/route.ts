import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildNickname } from "@/lib/membership";
import { hasAdminAreaAccess } from "@/lib/manageAuth";
import { getAuthUser } from "@/lib/auth";
import { createMembershipNotification } from "@/lib/notifications";
import { createWelcomeCard } from "@/lib/welcomeCard";
import { ensureSystemClubMembership } from "@/lib/systemClub";
import { rateLimitResponse, getClientIp } from "@/lib/rateLimit";
import { recordAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> | { id: string } };

/**
 * POST /api/admin/members/[id]/approve
 * 가입 승인 — 닉네임을 신청서의 검증된 나이·이름으로 무조건 재생성.
 * (승인 전 자가 설정한 위조 형식 닉네임이 '검증된 신원'으로 굳는 것을 차단)
 */
export async function POST(req: NextRequest, { params }: Params) {
  if (!(await hasAdminAreaAccess("staff"))) {
    return NextResponse.json({ ok: false, error: "NOT_ADMIN" }, { status: 401 });
  }

  const rl = rateLimitResponse(`admin-mutate:${getClientIp(req)}`, { windowMs: 60_000, max: 30 });
  if (rl) return rl;

  const { id } = params instanceof Promise ? await params : params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, nickname: true, realName: true, age: true, membershipStatus: true },
  });
  if (!user) {
    return NextResponse.json({ ok: false, error: "찾을 수 없습니다." }, { status: 404 });
  }
  if (user.membershipStatus === "none") {
    return NextResponse.json(
      { ok: false, error: "아직 가입 신청서를 제출하지 않은 사용자예요." },
      { status: 400 },
    );
  }

  const autoNickname =
    user.realName && user.age ? buildNickname(user.age, user.realName) : null;

  await prisma.user.update({
    where: { id },
    data: {
      membershipStatus: "approved",
      membershipDecidedAt: new Date(),
      membershipNote: null,
      // 승인 시점 나이를 불변 스냅샷으로 고정 — 이후 닉네임 집단/나이 검증의 기준.
      approvedAge: user.age,
      // 승인마다 초기화 — '승인 후 첫 진입에 성격유형 고르기 1회 안내'의 트리거.
      // 탈퇴 후 재가입·거절 후 재신청도 새 가입이므로 다시 안내받아야 한다.
      startPromptSeenAt: null,
      ...(autoNickname ? { nickname: autoNickname } : {}),
    },
  });

  // 본인에게 결과 알림 — 실패해도 승인 처리는 유효(best-effort).
  try {
    await createMembershipNotification(id, "approve");
  } catch (e) {
    console.error("[membership-notify] 알림 생성 실패:", e);
  }

  // 새가족 환영 카드 자동 게시 — best-effort.
  try {
    await createWelcomeCard(id, autoNickname ?? user.nickname);
  } catch (e) {
    console.error("[welcome-card] 생성 실패:", e);
  }

  // 청년부 전체 행사 보드 자동 멤버 등록 — best-effort.
  try {
    await ensureSystemClubMembership(id);
  } catch (e) {
    console.error("[system-club] 자동 등록 실패:", e);
  }

  // 감사 로그 — best-effort.
  try {
    await recordAudit({
      actor: await getAuthUser(),
      action: "membership_approve",
      targetType: "user",
      targetId: id,
      summary: `가입 승인 (${autoNickname ?? user.nickname ?? "no-nickname"})`,
      ip: getClientIp(req),
    });
  } catch (e) {
    console.error("[audit] membership_approve 기록 실패:", e);
  }

  return NextResponse.json({ ok: true, nickname: autoNickname ?? user.nickname });
}
