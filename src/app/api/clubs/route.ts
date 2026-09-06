import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { getAuthUser, membershipGate } from "@/lib/auth";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isClubCategory } from "@/lib/clubCategories";
import { clubCreateSchema } from "@/lib/clubSchema";
import { createAdminNotification } from "@/lib/notifications";

/**
 * GET /api/clubs
 * 승인 + 활성 동아리 목록 (공개) — 카테고리/검색어 필터 지원
 * ?category=스터디  &q=검색어
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category")?.trim();
  const q = searchParams.get("q")?.trim();

  const where: Record<string, unknown> = { isApproved: true, isActive: true, isSystem: false };
  if (category && isClubCategory(category)) where.category = category;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
      { tags: { contains: q, mode: "insensitive" } },
    ];
  }

  const clubs = await prisma.club.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      category: true,
      tags: true,
      maxMembers: true,
      viewCount: true,
      createdAt: true,
      _count: { select: { applications: { where: { status: "accepted" } } } },
      images: { select: { url: true }, orderBy: { order: "asc" }, take: 1 },
    },
  });

  const items = clubs.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    category: c.category,
    tags: c.tags,
    maxMembers: c.maxMembers,
    viewCount: c.viewCount,
    createdAt: c.createdAt,
    memberCount: c._count.applications,
    imageUrl: c.images[0]?.url ?? null,
  }));

  return NextResponse.json({ ok: true, items });
}

/**
 * POST /api/clubs
 * 동아리 개설 (로그인 필요) — 승인 대기(isApproved=false) 상태로 생성
 */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`club-create:${ip}`, { windowMs: 60_000, max: 5 })) {
    return NextResponse.json(
      { ok: false, code: "RATE_LIMIT", error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

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
    return NextResponse.json({ ok: false, error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  const parsed = clubCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "입력값 오류", fieldErrors: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { name, description, category, tags, maxMembers, images } = parsed.data;

  const club = await prisma.club.create({
    data: {
      name,
      description,
      category,
      tags,
      maxMembers: maxMembers ?? null,
      ownerUserId: user.dbUserId,
      // isApproved 기본값 false — 관리자 승인 후 노출
    },
    select: { id: true },
  });

  // 카드뉴스 이미지 저장
  if (images.length > 0) {
    await prisma.clubImage.createMany({
      data: images.map((img) => ({
        clubId: club.id,
        url: img.url,
        caption: img.caption,
        order: img.order,
      })),
    });
  }

  // 운영진에게 새 동아리 승인 요청 알림 (best-effort)
  try {
    await createAdminNotification({
      type: "admin_club_created",
      title: "동아리 승인 요청이 도착했어요",
      body: `${user.nickname ?? "누군가"}님이 '${name}' 동아리를 개설했어요.`,
      link: "/manage/clubs",
    });
  } catch {
    /* best-effort */
  }

  return NextResponse.json({ ok: true, id: club.id });
}
