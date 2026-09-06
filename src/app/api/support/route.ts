import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAuthUser } from "@/lib/auth";
import { hasAtLeast } from "@/lib/roles";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { createAdminNotification } from "@/lib/notifications";

const createSchema = z.object({
  content: z.string().trim().min(1, "내용을 입력해주세요.").max(2000, "내용이 너무 깁니다."),
  isAnonymous: z.boolean().default(false),
  isSecret: z.boolean().default(false),
});

/**
 * GET /api/support — 고객센터 문의 목록.
 * 로그인만 하면 접근 가능(가입 승인 여부 무관) — 가입 절차 자체에 대한 문의도 여기로 오므로
 * 광장(membershipGate)과 달리 승인 전 유저도 써야 한다.
 *
 * 노출 범위(단일 규칙):
 *  - 운영진(staff+): 전부
 *  - 본인 글: 항상
 *  - 그 외: isSecret=false 이면서 본인이 승인 멤버일 때만(비승인 유저는 남의 공개 글도 못 봄 —
 *    광장이 승인 멤버 전용 공간인 것과 같은 이유. 비승인 유저는 자기 문의만 보인다).
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }

  const isStaff = hasAtLeast(user.role, "staff");
  const isApprovedMember = isStaff || user.membershipStatus === "approved";

  const where = isStaff
    ? {}
    : {
        OR: [
          { userId: user.dbUserId },
          ...(isApprovedMember ? [{ isSecret: false }] : []),
        ],
      };

  const tickets = await prisma.supportTicket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      content: true,
      isAnonymous: true,
      isSecret: true,
      createdAt: true,
      userId: true,
      user: { select: { nickname: true, avatarUrl: true, role: true } },
      _count: { select: { replies: true } },
    },
  });

  const items = tickets.map((t) => ({
    id: t.id,
    content: t.content,
    isSecret: t.isSecret,
    createdAt: t.createdAt,
    isMine: t.userId === user.dbUserId,
    canDelete: t.userId === user.dbUserId || isStaff,
    authorId: t.isAnonymous ? null : t.userId,
    authorName: t.isAnonymous ? "익명" : t.user?.nickname ?? "탈퇴한 멤버",
    authorAvatar: t.isAnonymous ? null : t.user?.avatarUrl ?? null,
    // 익명 글은 작성자 배지도 숨긴다 — prayers/route.ts와 동일 원칙(신원 노출 방지).
    authorRole: t.isAnonymous ? null : t.user?.role ?? null,
    replyCount: t._count.replies,
  }));

  return NextResponse.json({ ok: true, items, isStaff });
}

/** POST /api/support — 문의 올리기. 로그인만 요구(가입 승인 여부 무관). */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`support-create:${ip}`, { windowMs: 60_000, max: 10 })) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.flatten().fieldErrors.content?.[0] ?? "입력값 오류" },
      { status: 400 },
    );
  }

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: user.dbUserId,
      content: parsed.data.content,
      isAnonymous: parsed.data.isAnonymous,
      isSecret: parsed.data.isSecret,
    },
    select: { id: true },
  });

  // 운영진에게 새 문의 알림 — best-effort. 익명이면 본문에 신청자 표시를 넣지 않는다.
  try {
    await createAdminNotification({
      type: "admin_support_ticket_created",
      title: "새 고객센터 문의가 도착했어요",
      body: parsed.data.isAnonymous
        ? "익명으로 문의가 접수됐어요."
        : `${user.nickname ?? "한 멤버"}님이 문의를 남겼어요.`,
      link: `/support#${ticket.id}`,
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true, id: ticket.id });
}
