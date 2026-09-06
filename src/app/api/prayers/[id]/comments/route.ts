import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAuthUser, membershipGate } from "@/lib/auth";
import { hasAtLeast } from "@/lib/roles";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { createNotification } from "@/lib/notifications";
import { isNewcomer } from "@/lib/newcomer";

type Params = { params: Promise<{ id: string }> | { id: string } };

const createSchema = z.object({
  content: z.string().trim().min(1, "댓글을 입력해주세요.").max(500, "댓글이 너무 깁니다."),
  parentId: z.string().trim().min(1).optional(),
});

/** GET /api/prayers/[id]/comments — 댓글 목록 (공개). 답글(대댓글)은 단일 깊이로 부모 아래 묶어 반환. */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = params instanceof Promise ? await params : params;

  // 댓글도 본문과 같은 기준으로 승인 멤버 전용 — 목록(GET /api/prayers)과 동일.
  // 댓글 작성자 표시명 역시 실명을 포함하므로 비로그인에게 내주지 않는다.
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  const gate = membershipGate(user);
  if (gate) return gate;

  const prayer = await prisma.prayer.findUnique({ where: { id }, select: { userId: true } });
  if (!prayer) return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });

  const comments = await prisma.prayerComment.findMany({
    where: { prayerId: id },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      content: true,
      createdAt: true,
      updatedAt: true,
      userId: true,
      parentId: true,
      user: { select: { nickname: true, avatarUrl: true, role: true, membershipDecidedAt: true } },
      // 좋아요는 개수만 세고, "내가 눌렀는지"는 내 행 1건만 골라 확인한다 —
      // likes를 통째로 가져오면 인기 댓글 하나가 응답을 수백 행으로 부풀린다.
      _count: { select: { likes: true } },
      likes: { where: { userId: user.dbUserId }, select: { id: true }, take: 1 },
    },
  });

  const isStaff = !!user && hasAtLeast(user.role, "staff");
  const postAuthorId = prayer.userId;
  function toItem(c: (typeof comments)[number]) {
    return {
      id: c.id,
      content: c.content,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      authorId: c.userId,
      authorName: c.user?.nickname ?? "탈퇴한 멤버",
      authorAvatar: c.user?.avatarUrl ?? null,
      authorRole: c.user?.role ?? null,
      isNewcomer: isNewcomer(c.user?.membershipDecidedAt ?? null),
      isMine: !!user && c.userId === user.dbUserId,
      likeCount: c._count.likes,
      iLiked: c.likes.length > 0,
      // 작성자 본인 · 글쓴이(글 모더레이션) · 운영진+ 가 삭제 가능
      canDelete: !!user && (c.userId === user.dbUserId || postAuthorId === user.dbUserId || isStaff),
      // 수정은 본인 댓글만 — 모더레이션 권한과 분리
      canEdit: !!user && c.userId === user.dbUserId,
    };
  }

  const repliesByParent = new Map<string, ReturnType<typeof toItem>[]>();
  for (const c of comments) {
    if (!c.parentId) continue;
    const list = repliesByParent.get(c.parentId) ?? [];
    list.push(toItem(c));
    repliesByParent.set(c.parentId, list);
  }
  const items = comments
    .filter((c) => !c.parentId)
    .map((c) => ({ ...toItem(c), replies: repliesByParent.get(c.id) ?? [] }));

  return NextResponse.json({ ok: true, items, loggedIn: !!user });
}

/** POST /api/prayers/[id]/comments — 댓글 작성 (승인 멤버만) */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = params instanceof Promise ? await params : params;

  const ip = getClientIp(req);
  if (!checkRateLimit(`prayer-comment:${ip}`, { windowMs: 60_000, max: 20 })) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  const gate = membershipGate(user);
  if (gate) return gate;

  const prayer = await prisma.prayer.findUnique({
    where: { id },
    select: { id: true, userId: true, category: true },
  });
  if (!prayer) return NextResponse.json({ ok: false, error: "글을 찾을 수 없습니다." }, { status: 404 });

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten().fieldErrors.content?.[0] ?? "입력값 오류" },
      { status: 400 },
    );
  }

  let parentId: string | null = null;
  let parentAuthorId: string | null = null;
  if (parsed.data.parentId) {
    const parent = await prisma.prayerComment.findUnique({
      where: { id: parsed.data.parentId },
      select: { id: true, prayerId: true, parentId: true, userId: true },
    });
    if (!parent || parent.prayerId !== id) {
      return NextResponse.json({ ok: false, error: "답글 대상을 찾을 수 없습니다." }, { status: 404 });
    }
    if (parent.parentId) {
      return NextResponse.json({ ok: false, error: "답글에는 답글을 달 수 없습니다." }, { status: 400 });
    }
    parentId = parent.id;
    parentAuthorId = parent.userId;
  }

  const comment = await prisma.prayerComment.create({
    data: { prayerId: id, userId: user.dbUserId, content: parsed.data.content, parentId },
    select: { id: true },
  });

  // 알림(글쓴이·답글 대상 댓글 작성자) — 본인에게는 보내지 않는다. best-effort.
  // 같은 글의 미읽음 알림이 이미 있으면 새로 만들지 않는다 → 한 글에 댓글이 쏟아져도
  // 미읽음은 1건으로 합쳐져 누적·도배를 막는다(읽으면 다음 댓글에 다시 알림).
  // body엔 댓글 원문을 넣지 않는다(임의 문구 반복 푸시 벡터 차단) — 닉네임만.
  const link = `/prayer?category=${encodeURIComponent(prayer.category)}#${id}`;
  async function notifyOnce(targetUserId: string, type: "prayer_comment" | "prayer_comment_reply", title: string, body: string) {
    try {
      const dup = await prisma.notification.findFirst({
        where: { userId: targetUserId, type, link, isRead: false },
        select: { id: true },
      });
      if (!dup) await createNotification({ userId: targetUserId, type, title, body, link });
    } catch {
      /* best-effort */
    }
  }

  if (prayer.userId !== user.dbUserId) {
    await notifyOnce(
      prayer.userId,
      "prayer_comment",
      "내 광장 글에 댓글이 달렸어요",
      `${user.nickname ?? "누군가"}님이 댓글을 남겼어요.`,
    );
  }
  if (parentAuthorId && parentAuthorId !== user.dbUserId && parentAuthorId !== prayer.userId) {
    await notifyOnce(
      parentAuthorId,
      "prayer_comment_reply",
      "내 댓글에 답글이 달렸어요",
      `${user.nickname ?? "누군가"}님이 답글을 남겼어요.`,
    );
  }

  return NextResponse.json({ ok: true, id: comment.id });
}
