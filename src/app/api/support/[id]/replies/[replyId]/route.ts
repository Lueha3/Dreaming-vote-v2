import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthUser, roleGate } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { recordAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string; replyId: string }> | { id: string; replyId: string } };

/**
 * DELETE /api/support/[id]/replies/[replyId] — 답글 삭제(운영진 전용).
 * 답글은 "운영진"이라는 하나의 목소리로 노출되므로(작성자 개별 신원 비공개),
 * 작성한 스태프 본인만이 아니라 어느 운영진이든 모더레이션으로 지울 수 있다.
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id, replyId } = params instanceof Promise ? await params : params;

  const user = await getAuthUser();
  const gate = roleGate(user, "staff");
  if (gate) return gate;

  if (!checkRateLimit(`support-reply-del:${user!.dbUserId}`, { windowMs: 60_000, max: 30 })) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const reply = await prisma.supportReply.findUnique({
    where: { id: replyId },
    select: { ticketId: true, staffId: true },
  });
  if (!reply || reply.ticketId !== id) {
    return NextResponse.json({ ok: false, error: "답글을 찾을 수 없습니다." }, { status: 404 });
  }

  await prisma.supportReply.delete({ where: { id: replyId } });

  // 본인 답글이 아닌 걸 지운 경우만 모더레이션으로 기록(자기 답글 정정은 감사 대상 아님).
  if (reply.staffId !== user!.dbUserId) {
    try {
      await recordAudit({
        actor: user,
        action: "content_delete",
        targetType: "support_reply",
        targetId: replyId,
        summary: "고객센터 답글 삭제(모더레이션)",
        ip: getClientIp(req),
      });
    } catch {
      /* best-effort */
    }
  }

  return NextResponse.json({ ok: true });
}
