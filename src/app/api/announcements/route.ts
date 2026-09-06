import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * GET /api/announcements — 공개 공지(게시된 것만). 인증 불필요.
 * ?pinned=1 → 고정 공지만 (배너용). 미지정 → 전체 게시 공지 (/notices 목록용).
 * 정렬: 고정 우선 → 최신순.
 */
export async function GET(req: NextRequest) {
  const limitRaw = req.nextUrl.searchParams.get("limit");
  const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 1, 1), 50) : undefined;
  const pinnedOnly = req.nextUrl.searchParams.get("pinned") === "1";

  const rows = await prisma.announcement.findMany({
    where: { isPublished: true, ...(pinnedOnly ? { isPinned: true } : {}) },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: {
      id: true,
      title: true,
      body: true,
      isPinned: true,
      createdAt: true,
      updatedAt: true,
      // 작성자는 조회하지 않는다 — 이 엔드포인트는 비로그인에게도 열려 있고,
      // 닉네임은 "집단-나이-실명" 형식이라 그대로 내보내면 운영진 실명이 공개된다.
      // 운영진 화면은 별도 인증 API(/api/manage/announcements)에서 작성자를 받는다.
    },
  });

  const items = rows.map((a) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    isPinned: a.isPinned,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  }));

  return NextResponse.json({ ok: true, items });
}
