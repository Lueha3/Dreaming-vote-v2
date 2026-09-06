import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser, roleGate } from "@/lib/auth";
import { canForceWithdraw, type Role } from "@/lib/roles";
import { rateLimitResponse, getClientIp } from "@/lib/rateLimit";
import { recordAudit } from "@/lib/audit";
import { createAdminNotification } from "@/lib/notifications";
import { withdrawUser } from "@/lib/withdrawal";

type Params = { params: Promise<{ id: string }> | { id: string } };

/**
 * POST /api/manage/members/[id]/withdraw
 * 운영진 이상이 대상 멤버를 강제 탈퇴 — canForceWithdraw로 등급 역전 행사 차단.
 * 익명화·소프트 삭제 로직은 /api/my/withdraw(본인 탈퇴)와 동일하게 공유한다.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const actor = await getAuthUser();
  const gate = roleGate(actor, "staff");
  if (gate) return gate;

  const rl = rateLimitResponse(`force-withdraw:${getClientIp(req)}`, {
    windowMs: 60_000,
    max: 10,
  });
  if (rl) return rl;

  const { id } = params instanceof Promise ? await params : params;

  // 본인은 강제 탈퇴 대상에서 제외(이 경로로 자가 탈퇴 차단 — 본인 탈퇴는 /api/my/withdraw 사용)
  if (id === actor!.dbUserId) {
    return NextResponse.json(
      { ok: false, error: "본인은 이 기능으로 탈퇴할 수 없습니다." },
      { status: 400 },
    );
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, nickname: true, deletedAt: true },
  });
  if (!target) {
    return NextResponse.json({ ok: false, error: "대상을 찾을 수 없습니다." }, { status: 404 });
  }
  if (target.deletedAt) {
    return NextResponse.json({ ok: false, error: "이미 탈퇴한 회원입니다." }, { status: 400 });
  }

  if (!canForceWithdraw(actor!.role, target.role as Role)) {
    return NextResponse.json(
      { ok: false, error: "이 멤버를 탈퇴시킬 권한이 없습니다." },
      { status: 403 },
    );
  }

  // PII 파기 + 툼스톤 — 자진 탈퇴와 완전히 동일한 처리(lib/withdrawal.ts).
  // 툼스톤이 특히 중요한 경로다: 예전엔 강제 탈퇴당한 사람이 같은 계정으로 다시
  // 로그인하는 것만으로 행이 되살아나 재신청 대기열에 흔적 없이 올라왔다.
  try {
    await withdrawUser(id);
  } catch (e) {
    console.error(`[force-withdraw] 실패 targetId=${id}`, e);
    return NextResponse.json(
      { ok: false, error: "탈퇴 처리에 실패했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  // 감사 로그 — best-effort(실패해도 탈퇴 처리는 유효).
  try {
    await recordAudit({
      actor,
      action: "membership_force_withdraw",
      targetType: "user",
      targetId: id,
      summary: `강제 탈퇴: ${target.nickname ?? "no-nickname"} (${target.role})`,
      ip: getClientIp(req),
    });
  } catch (e) {
    console.error("[audit] membership_force_withdraw 기록 실패:", e);
  }

  // 다른 운영진에게 강제 탈퇴 공유 (best-effort — 실행한 본인은 제외, PII 없이 닉네임만)
  try {
    await createAdminNotification(
      {
        type: "admin_member_withdrawn",
        title: "회원 탈퇴 — 강제",
        body: `${target.nickname ?? "한 멤버"}님이 ${actor!.nickname ?? "운영진"}님에 의해 탈퇴 처리됐어요.`,
        link: "/manage/members",
      },
      actor!.dbUserId,
    );
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true });
}
