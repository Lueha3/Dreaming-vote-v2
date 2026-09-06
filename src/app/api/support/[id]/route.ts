import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasAtLeast } from "@/lib/roles";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { recordAudit } from "@/lib/audit";
import { canSeeTicket } from "@/lib/support";

type Params = { params: Promise<{ id: string }> | { id: string } };

/** DELETE /api/support/[id] — 문의 삭제. 작성자 본인 또는 운영진(모더레이션)만. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = params instanceof Promise ? await params : params;
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });

  if (!checkRateLimit(`support-del:${user.dbUserId}`, { windowMs: 60_000, max: 30 })) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const ticket = await prisma.supportTicket.findUnique({
    where: { id },
    select: { userId: true, isSecret: true },
  });
  // "존재하지 않음"과 "볼 권한이 없음"을 같은 404로 응답한다 — 403을 쓰면 그 자체로
  // "이 id의 비밀글이 실재한다"는 사실이 새어나간다(replies 라우트와 동일 원칙, lib/support.ts).
  if (!ticket || !canSeeTicket(ticket, user)) {
    return NextResponse.json({ ok: false, error: "문의를 찾을 수 없습니다." }, { status: 404 });
  }

  // 여기까지 왔다면 이미 이 티켓이 "보인다"는 걸 아는 상태(본인 글이거나 공개 글이거나 운영진)이므로,
  // 삭제 권한이 없다는 403은 새로운 정보를 흘리지 않는다.
  const isStaff = hasAtLeast(user.role, "staff");
  const isModeration = ticket.userId !== user.dbUserId;
  if (isModeration && !isStaff) {
    return NextResponse.json({ ok: false, error: "권한이 없습니다." }, { status: 403 });
  }

  await prisma.supportTicket.delete({ where: { id } }); // 답글은 onDelete: Cascade로 함께 삭제

  if (isModeration) {
    try {
      await recordAudit({
        actor: user,
        action: "content_delete",
        targetType: "support_ticket",
        targetId: id,
        summary: "고객센터 문의 삭제(모더레이션)",
        ip: getClientIp(req),
      });
    } catch {
      /* best-effort */
    }
  }

  return NextResponse.json({ ok: true });
}
