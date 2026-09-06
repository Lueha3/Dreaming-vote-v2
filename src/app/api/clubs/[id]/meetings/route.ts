import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAuthUser, membershipGate } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { createNotifications } from "@/lib/notifications";

type Params = { params: Promise<{ id: string }> | { id: string } };

const createSchema = z.object({
  title: z.string().trim().min(1).max(60).default("정기 모임"),
  meetsAt: z.string().datetime({ offset: true }).or(z.string().datetime()),
  place: z.string().trim().min(1, "장소를 입력해주세요.").max(100),
  items: z.string().trim().max(200).nullable().optional(),
  fee: z.string().trim().max(50).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

/** 이 동아리의 멤버(개설자 or accepted)인지 판정 */
async function getMembershipInfo(clubId: string, dbUserId: string | null) {
  const club = await prisma.club.findUnique({
    where: { id: clubId },
    select: { id: true, ownerUserId: true },
  });
  if (!club) return { club: null, isOwner: false, isMember: false };
  if (!dbUserId) return { club, isOwner: false, isMember: false };

  const isOwner = club.ownerUserId === dbUserId;
  if (isOwner) return { club, isOwner: true, isMember: true };

  const app = await prisma.clubApplication.findUnique({
    where: { clubId_userId: { clubId, userId: dbUserId } },
    select: { status: true },
  });
  return { club, isOwner: false, isMember: app?.status === "accepted" };
}

/**
 * GET /api/clubs/[id]/meetings
 * 모임 공지 목록 — 동아리 멤버(개설자+가입 멤버)에게만 공개.
 * 모임 장소·시간은 민감 정보라 비멤버에겐 403 (code: member_only).
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = params instanceof Promise ? await params : params;

  const user = await getAuthUser();
  const { club, isOwner, isMember } = await getMembershipInfo(id, user?.dbUserId ?? null);

  if (!club) {
    return NextResponse.json({ ok: false, error: "동아리를 찾을 수 없습니다." }, { status: 404 });
  }
  if (!isMember) {
    return NextResponse.json(
      { ok: false, code: "member_only", error: "모임 일정은 동아리 멤버에게만 공개돼요." },
      { status: 403 },
    );
  }

  const rows = await prisma.clubMeeting.findMany({
    where: { clubId: id },
    orderBy: { meetsAt: "asc" },
    select: {
      id: true,
      title: true,
      meetsAt: true,
      place: true,
      items: true,
      fee: true,
      note: true,
      _count: { select: { reviews: true, images: true } },
      images: { take: 1, orderBy: [{ order: "asc" }, { createdAt: "asc" }], select: { url: true } },
    },
  });

  const meetings = rows.map((m) => ({
    id: m.id,
    title: m.title,
    meetsAt: m.meetsAt,
    place: m.place,
    items: m.items,
    fee: m.fee,
    note: m.note,
    reviewCount: m._count.reviews,
    imageCount: m._count.images,
    coverImage: m.images[0]?.url ?? null,
  }));

  return NextResponse.json({ ok: true, isOwner, meetings });
}

/**
 * POST /api/clubs/[id]/meetings
 * 모임 공지 등록 — 개설자만.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`meeting-create:${ip}`, { windowMs: 60_000, max: 10 })) {
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

  const club = await prisma.club.findUnique({
    where: { id },
    select: { ownerUserId: true, name: true },
  });
  if (!club) {
    return NextResponse.json({ ok: false, error: "동아리를 찾을 수 없습니다." }, { status: 404 });
  }
  if (club.ownerUserId !== user.dbUserId) {
    return NextResponse.json({ ok: false, error: "개설자만 모임을 공지할 수 있어요." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "입력값을 확인해주세요.", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const meeting = await prisma.clubMeeting.create({
    data: {
      clubId: id,
      title: parsed.data.title,
      meetsAt: new Date(parsed.data.meetsAt),
      place: parsed.data.place,
      items: parsed.data.items ?? null,
      fee: parsed.data.fee ?? null,
      note: parsed.data.note ?? null,
    },
    select: { id: true },
  });

  // 가입 멤버(accepted) 전원에게 새 모임 알림 (개설자는 application이 아니라 자동 제외). best-effort
  try {
    const members = await prisma.clubApplication.findMany({
      where: { clubId: id, status: "accepted" },
      select: { userId: true },
    });
    await createNotifications(
      members.map((m) => m.userId),
      {
        type: "club_meeting_created",
        title: "새 모임 공지가 올라왔어요",
        body: `'${club.name}'에 '${parsed.data.title}' 모임이 공지됐어요.`,
        link: `/clubs/${id}/meetings/${meeting.id}`,
      },
    );
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true, id: meeting.id });
}
