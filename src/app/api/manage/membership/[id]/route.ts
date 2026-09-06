import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthUser, roleGate } from "@/lib/auth";
import { createMembershipNotification } from "@/lib/notifications";
import { createWelcomeCard } from "@/lib/welcomeCard";
import { ensureSystemClubMembership } from "@/lib/systemClub";
import { rateLimitResponse, getClientIp } from "@/lib/rateLimit";
import { recordAudit } from "@/lib/audit";
import { buildNickname } from "@/lib/membership";

type Params = { params: Promise<{ id: string }> | { id: string } };

export async function PATCH(req: NextRequest, { params }: Params) {
  const user = await getAuthUser();
  const gate = roleGate(user, "staff");
  if (gate) return gate;

  const rl = rateLimitResponse(`membership-decide:${getClientIp(req)}`, { windowMs: 60_000, max: 30 });
  if (rl) return rl;

  const { id } = params instanceof Promise ? await params : params;

  let body: { action?: string; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { action, note } = body;

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ ok: false, error: "action은 approve 또는 reject여야 합니다." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, membershipStatus: true, nickname: true, realName: true, age: true },
  });

  if (!target) {
    return NextResponse.json({ ok: false, error: "유저를 찾을 수 없습니다." }, { status: 404 });
  }

  if (target.membershipStatus !== "pending") {
    return NextResponse.json(
      { ok: false, error: "대기 중인 가입 신청이 아닙니다." },
      { status: 409 },
    );
  }

  // 승인 시 닉네임을 신청서의 검증된 나이·이름으로 생성 — admin/members/[id]/approve와 동일 규칙.
  // (누락되면 승인된 멤버가 닉네임 없이 남는 버그가 생긴다 — 2026-07-02 실사용 계정에서 발견)
  const autoNickname =
    action === "approve" && target.realName && target.age
      ? buildNickname(target.age, target.realName)
      : null;

  await prisma.user.update({
    where: { id },
    data: {
      membershipStatus: action === "approve" ? "approved" : "rejected",
      membershipDecidedAt: new Date(),
      membershipNote: action === "reject" && note?.trim() ? note.trim() : null,
      // 승인 시점 나이를 불변 스냅샷으로 고정 — 이후 닉네임 집단/나이 검증의 기준.
      // startPromptSeenAt은 승인마다 초기화 — '승인 후 첫 진입에 성격유형 고르기 1회 안내'의
      // 트리거다. 탈퇴 후 재가입·거절 후 재신청도 새 가입이므로 다시 안내받아야 한다.
      ...(action === "approve" ? { approvedAge: target.age, startPromptSeenAt: null } : {}),
      ...(autoNickname ? { nickname: autoNickname } : {}),
    },
  });

  // 본인에게 결과 알림 — 실패해도 승인/거절 처리는 유효(best-effort).
  try {
    await createMembershipNotification(id, action, note);
  } catch (e) {
    console.error("[membership-notify] 알림 생성 실패:", e);
  }

  // 새가족 환영 카드 자동 게시 — best-effort.
  if (action === "approve") {
    try {
      await createWelcomeCard(id, autoNickname ?? target.nickname);
    } catch (e) {
      console.error("[welcome-card] 생성 실패:", e);
    }
    try {
      await ensureSystemClubMembership(id);
    } catch (e) {
      console.error("[system-club] 자동 등록 실패:", e);
    }
  }

  // 감사 로그 — best-effort.
  try {
    await recordAudit({
      actor: user,
      action: action === "approve" ? "membership_approve" : "membership_reject",
      targetType: "user",
      targetId: id,
      summary:
        action === "approve"
          ? `가입 승인 (${autoNickname ?? target.nickname ?? "no-nickname"})`
          : `가입 거절 (${target.nickname ?? "no-nickname"})${note?.trim() ? `: ${note.trim()}` : ""}`,
      ip: getClientIp(req),
    });
  } catch (e) {
    console.error("[audit] membership 기록 실패:", e);
  }

  return NextResponse.json({ ok: true, id, action });
}
