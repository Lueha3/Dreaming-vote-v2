import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAuthUser, membershipGate } from "@/lib/auth";
import { getClubMembership } from "@/lib/clubAccess";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { SUPABASE_STORAGE_PREFIX } from "@/lib/storage";

type Params = {
  params: Promise<{ id: string; meetingId: string }> | { id: string; meetingId: string };
};

const MAX_PER_MEETING = 30;

// URL은 우리 Storage(club-images) prefix만 허용 — 외부 URL·위험 스킴을 스키마에서 fail-closed로 차단.
const schema = z.object({
  images: z
    .array(
      z.object({
        url: z.string().url().max(1000).startsWith(SUPABASE_STORAGE_PREFIX),
        caption: z.string().trim().max(100).optional(),
      }),
    )
    .min(1)
    .max(10),
});

/**
 * POST /api/clubs/[id]/meetings/[meetingId]/images
 * 모임 갤러리 사진 등록 — 동아리 멤버 누구나. (실제 업로드는 클라이언트가 Storage로 직접, 여기선 URL 영속화)
 */
export async function POST(req: NextRequest, { params }: Params) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`meeting-image:${ip}`, { windowMs: 60_000, max: 20 })) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMIT", error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const { id, meetingId } = params instanceof Promise ? await params : params;

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  const gate = membershipGate(user);
  if (gate) return gate;

  const { club, isMember } = await getClubMembership(id, user.dbUserId);
  if (!club) {
    return NextResponse.json({ ok: false, error: "동아리를 찾을 수 없습니다." }, { status: 404 });
  }
  if (!isMember) {
    return NextResponse.json(
      { ok: false, code: "member_only", error: "동아리 멤버만 사진을 올릴 수 있어요." },
      { status: 403 },
    );
  }

  const meeting = await prisma.clubMeeting.findUnique({
    where: { id: meetingId },
    select: { clubId: true },
  });
  if (!meeting || meeting.clubId !== id) {
    return NextResponse.json({ ok: false, error: "모임을 찾을 수 없습니다." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "입력값을 확인해주세요." }, { status: 400 });
  }

  const existing = await prisma.clubMeetingImage.count({ where: { meetingId } });
  if (existing + parsed.data.images.length > MAX_PER_MEETING) {
    return NextResponse.json(
      { ok: false, error: `사진은 모임당 최대 ${MAX_PER_MEETING}장까지 올릴 수 있어요.` },
      { status: 400 },
    );
  }

  const agg = await prisma.clubMeetingImage.aggregate({
    where: { meetingId },
    _max: { order: true },
  });
  let order = (agg._max.order ?? -1) + 1;

  await prisma.clubMeetingImage.createMany({
    data: parsed.data.images.map((im) => ({
      meetingId,
      userId: user.dbUserId,
      url: im.url,
      caption: im.caption ?? "",
      order: order++,
    })),
  });

  return NextResponse.json({ ok: true, added: parsed.data.images.length });
}
