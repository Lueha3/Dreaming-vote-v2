import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAuthUser, membershipGate } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { createNotification } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> | { id: string } };

const applySchema = z.object({
  message: z.string().trim().max(500, "메시지가 너무 깁니다.").nullable().optional(),
});

/**
 * POST /api/clubs/[id]/apply
 * 동아리 가입 신청 (로그인 필요) — status="pending"으로 생성.
 * 반려(rejected) 이력이 있으면 재신청 허용(upsert).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`club-apply:${ip}`, { windowMs: 60_000, max: 10 })) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMIT", error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const { id } = params instanceof Promise ? await params : params;

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  const gate = membershipGate(user);
  if (gate) return gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const parsed = applySchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "입력값 오류" }, { status: 400 });
  }
  const message = parsed.data.message ?? null;

  const club = await prisma.club.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      ownerUserId: true,
      isApproved: true,
      isActive: true,
      maxMembers: true,
      _count: { select: { applications: { where: { status: "accepted" } } } },
    },
  });

  if (!club || !club.isApproved || !club.isActive) {
    return NextResponse.json({ ok: false, error: "동아리를 찾을 수 없습니다." }, { status: 404 });
  }

  if (club.ownerUserId === user.dbUserId) {
    return NextResponse.json(
      { ok: false, error: "본인이 개설한 동아리에는 신청할 수 없습니다." },
      { status: 400 },
    );
  }

  const existing = await prisma.clubApplication.findUnique({
    where: { clubId_userId: { clubId: id, userId: user.dbUserId } },
    select: { status: true },
  });
  if (existing && (existing.status === "pending" || existing.status === "accepted")) {
    return NextResponse.json(
      {
        ok: false,
        error:
          existing.status === "accepted" ? "이미 가입된 동아리입니다." : "이미 신청한 동아리입니다.",
      },
      { status: 409 },
    );
  }

  // 정원 확인 (수락된 멤버 기준)
  if (club.maxMembers && club._count.applications >= club.maxMembers) {
    return NextResponse.json({ ok: false, error: "정원이 가득 찼습니다." }, { status: 409 });
  }

  await prisma.clubApplication.upsert({
    where: { clubId_userId: { clubId: id, userId: user.dbUserId } },
    update: { status: "pending", message },
    create: { clubId: id, userId: user.dbUserId, status: "pending", message },
  });

  // 개설자에게 새 신청 알림 (best-effort — 알림 실패가 신청 자체를 막지 않음)
  try {
    await createNotification({
      userId: club.ownerUserId,
      type: "club_application_received",
      title: "새 가입 신청이 도착했어요",
      body: `'${club.name}'에 ${user.nickname ?? "누군가"}님이 가입을 신청했어요.`,
      link: "/my/clubs",
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true });
}
