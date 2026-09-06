import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthUser, membershipGate } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rateLimit";

type Params = {
  params: Promise<{ id: string; commentId: string }> | { id: string; commentId: string };
};

/**
 * POST /api/prayers/[id]/comments/[commentId]/like — 댓글 좋아요 토글 (승인 멤버만).
 * 글 공감(/pray)과 같은 규칙: 행이 있으면 지우고 없으면 만든다.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id, commentId } = params instanceof Promise ? await params : params;

  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  const gate = membershipGate(user);
  if (gate) return gate;

  // 토글 스팸(생성/삭제 반복 DB 처닝) 방지 — 유저 단위(공유 IP 무관) 한도. /pray와 동일.
  if (!checkRateLimit(`clike:${user.dbUserId}`, { windowMs: 60_000, max: 60 })) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  // 댓글이 이 글의 것인지 확인 — 확인 없이 commentId만 믿으면 다른 글의 댓글에
  // 좋아요를 꽂을 수 있다(경로의 [id]가 아무 의미 없어진다).
  const comment = await prisma.prayerComment.findUnique({
    where: { id: commentId },
    select: { id: true, prayerId: true },
  });
  if (!comment || comment.prayerId !== id) {
    return NextResponse.json({ ok: false, error: "댓글을 찾을 수 없습니다." }, { status: 404 });
  }

  const existing = await prisma.prayerCommentLike.findUnique({
    where: { commentId_userId: { commentId, userId: user.dbUserId } },
    select: { id: true },
  });

  if (existing) {
    // 같은 취소 요청이 두 번 겹쳐 들어와도 두 번째가 500이 되지 않도록 조건부 삭제.
    await prisma.prayerCommentLike.deleteMany({ where: { id: existing.id } });
  } else {
    // 동시 클릭으로 유니크 제약에 걸리면 "이미 눌린 상태"가 목표와 같으므로 조용히 넘어간다.
    await prisma.prayerCommentLike
      .create({ data: { commentId, userId: user.dbUserId } })
      .catch(() => undefined);
  }

  const likeCount = await prisma.prayerCommentLike.count({ where: { commentId } });
  return NextResponse.json({ ok: true, iLiked: !existing, likeCount });
}
