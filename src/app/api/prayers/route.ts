import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { getAuthUser, membershipGate } from "@/lib/auth";
import { hasAtLeast } from "@/lib/roles";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { isValidPlazaImageUrl } from "@/lib/storage";
import { isNewcomer } from "@/lib/newcomer";

// 광장 카테고리 — 일상 | 기도해주세요 | 동아리광고
export const CATEGORIES = ["일상", "기도해주세요", "동아리광고"] as const;
type Category = (typeof CATEGORIES)[number];

const createSchema = z.object({
  category: z.enum(CATEGORIES).default("일상"),
  content: z.string().trim().max(2000, "내용이 너무 깁니다.").default(""),
  isAnonymous: z.boolean().default(false),
  images: z.array(z.string()).max(5, "사진은 최대 5장까지 올릴 수 있어요.").default([]),
  clubId: z.string().trim().min(1).optional(),
  promptId: z.string().trim().min(1).optional(),
});

function resolveCategory(raw: string | null): Category {
  return (CATEGORIES as readonly string[]).includes(raw ?? "") ? (raw as Category) : "일상";
}

/**
 * GET /api/prayers?category=일상|기도해주세요|동아리광고
 * 카테고리별 광장 글 목록.
 * - 일상/기도해주세요: 레거시 동아리 기도 코너(clubId 있는 글)는 제외.
 * - 동아리광고: 반대로 clubId가 반드시 붙는 글이라 필터 없이 그대로 노출.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const category = resolveCategory(searchParams.get("category"));

  // 광장 글은 승인 멤버 전용. 글 본문에는 기도제목(건강·가정사 등)이 담기고 작성자
  // 표시명은 실명을 포함하므로, 목록 조회를 로그인·승인 뒤로 둔다.
  // (예전엔 비로그인도 목록을 받아 /prayer 페이지가 그대로 렌더했다 — 공개 노출이었다.)
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  }
  const gate = membershipGate(user);
  if (gate) return gate;

  const where = category === "동아리광고" ? { category } : { category, clubId: null };

  const prayers = await prisma.prayer.findMany({
    where,
    orderBy: [{ isAnswered: "asc" }, { createdAt: "desc" }],
    take: 100,
    select: {
      id: true,
      category: true,
      content: true,
      isAnonymous: true,
      isAnswered: true,
      answeredNote: true,
      answeredAt: true,
      createdAt: true,
      updatedAt: true,
      userId: true,
      systemType: true,
      promptId: true,
      user: { select: { nickname: true, avatarUrl: true, role: true, membershipDecidedAt: true } },
      images: { select: { url: true }, orderBy: { order: "asc" } },
      club: {
        select: {
          id: true,
          name: true,
          category: true,
          isApproved: true,
          isActive: true,
          maxMembers: true,
          ownerUserId: true,
          images: { select: { url: true }, orderBy: { order: "asc" }, take: 1 },
          _count: { select: { applications: { where: { status: "accepted" } } } },
        },
      },
      _count: { select: { intercessions: true, comments: true } },
      intercessions: user
        ? { where: { userId: user.dbUserId }, select: { id: true } }
        : false,
    },
  });

  const isStaff = !!user && hasAtLeast(user.role, "staff");
  const items = prayers.map((p) => ({
    id: p.id,
    category: p.category,
    content: p.content,
    isAnswered: p.isAnswered,
    answeredNote: p.answeredNote,
    answeredAt: p.answeredAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    isMine: !!user && p.userId === user.dbUserId,
    // 작성자 본인 또는 운영진+ 가 삭제(모더레이션) 가능
    canDelete: (!!user && p.userId === user.dbUserId) || isStaff,
    // 수정은 본인 글만 — 운영진도 타인 글 내용은 못 고침
    canEdit: !!user && p.userId === user.dbUserId,
    authorId: p.isAnonymous ? null : p.userId,
    // 닉네임이 없는 건 '익명으로 올린 글'이 아니라 '작성자가 탈퇴한 글'이다(탈퇴 시 nickname을 비운다).
    // 둘을 같은 '익명'으로 뭉뚱그리면, 실명으로 쓴 글이 익명 글처럼 보인다 —
    // 새가족 환영 카드(systemType: welcome)는 본인 명의로 올라가므로 탈퇴 즉시 이 오해가 생겼다.
    // 댓글·고객센터 라우트는 이미 '탈퇴한 멤버'로 구분하고 있어 표기도 그쪽에 맞춘다.
    authorName: p.isAnonymous ? "익명" : p.user?.nickname ?? "탈퇴한 멤버",
    authorAvatar: p.isAnonymous ? null : p.user?.avatarUrl ?? null,
    // 익명 글은 작성자 배지도 숨긴다(관리자/운영진 신원 노출 방지)
    authorRole: p.isAnonymous ? null : p.user?.role ?? null,
    isNewcomer: p.isAnonymous ? false : isNewcomer(p.user?.membershipDecidedAt ?? null),
    systemType: p.systemType,
    promptId: p.promptId,
    images: p.images.map((im) => im.url),
    // 미승인/비활성 동아리는 clubDetail.ts와 동일한 기준(개설자·운영진만 열람)으로 숨긴다 —
    // 광고 글의 clubId는 사후 반려·비활성화 후에도 남아있어 원본 검증 없이 그대로 노출하면 안 됨.
    club:
      p.club && (
        (p.club.isApproved && p.club.isActive) ||
        isStaff ||
        (!!user && p.club.ownerUserId === user.dbUserId)
      )
        ? {
            id: p.club.id,
            name: p.club.name,
            category: p.club.category,
            isApproved: p.club.isApproved,
            isActive: p.club.isActive,
            maxMembers: p.club.maxMembers,
            imageUrl: p.club.images[0]?.url ?? null,
            memberCount: p.club._count.applications,
          }
        : null,
    reactionCount: p._count.intercessions,
    iReacted: Array.isArray(p.intercessions) ? p.intercessions.length > 0 : false,
    commentCount: p._count.comments,
  }));

  return NextResponse.json({ ok: true, items, loggedIn: !!user });
}

/** POST /api/prayers — 광장 글 올리기 (내용 또는 사진 최소 1개 필요) */
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!checkRateLimit(`prayer-create:${ip}`, { windowMs: 60_000, max: 10 })) {
    return NextResponse.json(
      { ok: false, error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  const gate = membershipGate(user);
  if (gate) return gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    const msg =
      fieldErrors.content?.[0] ?? fieldErrors.images?.[0] ?? fieldErrors.category?.[0] ?? "입력값 오류";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  const { category, content, images, clubId, promptId } = parsed.data;
  const trimmed = content.trim();

  // 아이스브레이커 답변 태깅 — 존재하는 질문에만 연결(위조 방지).
  let attachedPromptId: string | null = null;
  if (promptId) {
    const prompt = await prisma.icebreakerPrompt.findUnique({ where: { id: promptId }, select: { id: true } });
    if (!prompt) {
      return NextResponse.json({ ok: false, error: "존재하지 않는 질문이에요." }, { status: 400 });
    }
    attachedPromptId = promptId;
  }
  // 익명은 민감한 기도제목 보호용 — 기도해주세요에서만 허용(클라 우회 방지, 서버 강제)
  const isAnonymous = category === "기도해주세요" ? parsed.data.isAnonymous : false;

  // 동아리광고 — 소속(개설자 또는 승인 멤버)이 확인된 공개 동아리만 첨부 허용.
  let attachedClubId: string | null = null;
  if (category === "동아리광고") {
    if (!clubId) {
      return NextResponse.json({ ok: false, error: "광고할 동아리를 선택해주세요." }, { status: 400 });
    }
    const club = await prisma.club.findUnique({
      where: { id: clubId },
      select: { id: true, ownerUserId: true, isApproved: true, isActive: true },
    });
    if (!club || !club.isApproved || !club.isActive) {
      return NextResponse.json(
        { ok: false, error: "존재하지 않거나 공개되지 않은 동아리예요." },
        { status: 400 },
      );
    }
    if (club.ownerUserId !== user.dbUserId) {
      const application = await prisma.clubApplication.findUnique({
        where: { clubId_userId: { clubId, userId: user.dbUserId } },
        select: { status: true },
      });
      if (application?.status !== "accepted") {
        return NextResponse.json(
          { ok: false, error: "소속된 동아리만 광고할 수 있어요." },
          { status: 403 },
        );
      }
    }
    attachedClubId = clubId;
  }

  // 이미지 URL 화이트리스트 검증 — 우리 plaza-images 버킷 외 URL은 fail-closed 차단.
  const validImages = images.filter(isValidPlazaImageUrl);
  if (validImages.length !== images.length) {
    return NextResponse.json(
      { ok: false, error: "유효하지 않은 이미지가 포함돼 있어요." },
      { status: 400 },
    );
  }

  if (!trimmed && validImages.length === 0) {
    return NextResponse.json(
      { ok: false, error: "내용이나 사진을 올려주세요." },
      { status: 400 },
    );
  }

  const prayer = await prisma.prayer.create({
    data: {
      userId: user.dbUserId,
      category,
      content: trimmed,
      isAnonymous,
      scope: "ALL",
      clubId: attachedClubId,
      promptId: attachedPromptId,
      images: validImages.length
        ? { create: validImages.map((url, i) => ({ url, order: i })) }
        : undefined,
    },
    select: { id: true },
  });

  return NextResponse.json({ ok: true, id: prayer.id });
}
