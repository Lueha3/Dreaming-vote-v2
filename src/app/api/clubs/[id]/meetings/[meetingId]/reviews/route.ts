import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAuthUser, membershipGate } from "@/lib/auth";
import { getClubMembership } from "@/lib/clubAccess";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

type Params = {
  params: Promise<{ id: string; meetingId: string }> | { id: string; meetingId: string };
};

const schema = z.object({
  content: z.string().trim().min(1, "내용을 입력해주세요.").max(1000, "내용이 너무 길어요."),
});

/**
 * POST /api/clubs/[id]/meetings/[meetingId]/reviews
 * 모임 후기 작성 — 동아리 멤버 누구나.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`meeting-review:${ip}`, { windowMs: 60_000, max: 20 })) {
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
      { ok: false, code: "member_only", error: "동아리 멤버만 후기를 남길 수 있어요." },
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
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." },
      { status: 400 },
    );
  }

  const created = await prisma.clubMeetingReview.create({
    data: { meetingId, userId: user.dbUserId, content: parsed.data.content },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: created.id });
}
