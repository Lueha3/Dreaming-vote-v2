import { unstable_cache } from "next/cache";

import { prisma } from "@/lib/db";
import { getWeekMonday } from "@/lib/week";
import { isNewcomer } from "@/lib/newcomer";
import type { Role } from "@/lib/roles";
import { FEATURES } from "@/lib/features";

/**
 * 홈 '오늘의 청년부' 피드 데이터 — API 라우트(/api/feed)와 홈 서버 렌더(page.tsx)가 공유한다.
 * 날짜는 클라이언트가 기대하는 ISO 문자열로 직렬화해 두 경로의 응답 형태를 동일하게 맞춘다.
 *
 * 성능: 서로 의존 없는 쿼리를 한 번의 Promise.all로 묶어 순차 DB 왕복 깊이를 최소화한다.
 * (다가오는 모임만 내 동아리 id 집합에 의존하므로 그 한 갈래만 2단계로 둔다)
 */
export type FeedData = {
  hasPersonalityReport: boolean;
  upcomingMeetings: {
    id: string;
    clubId: string;
    clubName: string;
    title: string;
    meetsAt: string;
    place: string;
  }[];
  recentClubs: {
    id: string;
    name: string;
    category: string;
    memberCount: number;
    imageUrl: string | null; // 카드뉴스 첫 장(order 0) — 홈 대문 캐러셀 커버. 없으면 카테고리 폴백.
    keyword: string | null; // tags 첫 항목 — 캐러셀 오버레이 '카테고리 · 키워드 · 인원'용.
  }[];
  // 캐러셀 카운터 분모 겸 '+N개 더' 판정용 — 승인·활성·비시스템 동아리 전체 수.
  recentClubsTotal: number;
  recentPosts: {
    id: string;
    category: string;
    snippet: string;
    authorName: string;
    avatarUrl: string | null;
    systemType: string | null; // welcome | birthday — 홈에서 골드 톤으로 구분 표시
    createdAt: string;
    reactionCount: number;
    commentCount: number;
    imageUrl: string | null; // 첫 첨부 사진 — 리드 카드 풀블리드/행 썸네일용
    imageCount: number; // 첨부 사진 수 — 다중 사진 '+N' 칩
    isAnswered: boolean; // 응답된 기도 — '응답됨' 배지
    isAnonymous: boolean; // 익명 글 — 역할/새가족 배지 억제 판단
    authorRole: Role | null; // 역할 배지(익명이면 null로 마스킹)
    isNewcomer: boolean; // 새가족 배지(익명이면 false로 마스킹)
  }[];
  // 이번 주 아이스브레이커 질문 — 홈 최상단 브리핑 카드의 주인공(없으면 null).
  prompt: { id: string; question: string; answerCount: number } | null;
};

type GlobalFeed = Pick<
  FeedData,
  "recentClubs" | "recentClubsTotal" | "recentPosts" | "prompt"
>;

// 홈 '광장 소식' 카드 스택에 실을 최신 글 수.
const PLAZA_MAX = 5;

// 홈 대문 캐러셀에 한 번에 실을 최대 슬라이드 수 — 초과분은 '전체 N개 보기' 슬라이드로 유도.
// 공유 캐시(home-global-feed) payload가 무한정 커지지 않게 상한을 둔다.
const CAROUSEL_MAX = 16;

/** tags(쉼표/전각쉼표/일본어 읽음표 구분)에서 첫 키워드만 — 없으면 null. */
function firstKeyword(tags: string): string | null {
  return tags.split(/[,，、]/).map((s) => s.trim()).filter(Boolean)[0] ?? null;
}

/** 홈 피드의 전역 캐시 태그 — 새 동아리/광장글/응답기도 반영 시 revalidateTag로 즉시 무효화 가능. */
export const HOME_FEED_TAG = "home-feed";

/**
 * 전역(모든 유저 공통) 피드 — 최근 개설 동아리 + 광장 최신 글 + 응답된 기도.
 * 내용이 유저와 무관하게 동일하므로 unstable_cache로 ~60초 묶어, 매 요청·매 유저가
 * DB를 치는 대신 윈도우당 1회만 조회한다(콜드/원격 왕복 비용을 대다수 로드에서 제거).
 */
const getGlobalFeed = unstable_cache(
  async (): Promise<GlobalFeed> => {
    const CLUB_WHERE = { isApproved: true, isActive: true, isSystem: false } as const;
    const [recentClubsRaw, recentClubsTotal, recentPostsRaw, promptRaw] = await Promise.all([
      prisma.club.findMany({
        // isSystem 제외 — 전체 행사 보드는 '새로 생긴 동아리'가 아니다.
        where: CLUB_WHERE,
        orderBy: { createdAt: "desc" },
        take: CAROUSEL_MAX,
        select: {
          id: true,
          name: true,
          category: true,
          tags: true,
          _count: { select: { applications: { where: { status: "accepted" } } } },
          // 커버 = 카드뉴스 첫 장(목록 카드/상세 히어로와 동일한 order asc 첫 이미지).
          images: { select: { url: true }, orderBy: { order: "asc" }, take: 1 },
        },
      }),
      // 캐러셀에 실은 수(≤16)보다 실제 동아리가 많으면 '전체 보기' 유도용.
      prisma.club.count({ where: CLUB_WHERE }),
      // 광장이 꺼져 있으면 광장 글·이번 주 질문은 조회하지 않는다(빈 배열/null로 대체).
      !FEATURES.plaza ? Promise.resolve([]) : prisma.prayer.findMany({
        // clubId: null — 정식 광장 목록(/api/prayers)과 동일하게 레거시 동아리 기도(clubId!=null) 제외.
        where: { clubId: null },
        orderBy: { createdAt: "desc" },
        take: PLAZA_MAX,
        select: {
          id: true,
          category: true,
          content: true,
          isAnonymous: true,
          isAnswered: true,
          systemType: true,
          createdAt: true,
          user: { select: { nickname: true, avatarUrl: true, role: true, membershipDecidedAt: true } },
          images: { select: { url: true }, orderBy: { order: "asc" }, take: 1 },
          _count: { select: { intercessions: true, comments: true, images: true } },
        },
      }),
      !FEATURES.plaza ? Promise.resolve(null) : prisma.icebreakerPrompt.findUnique({
        where: { weekOf: getWeekMonday(new Date()) },
        select: { id: true, question: true, _count: { select: { answers: true } } },
      }),
    ]);

    return {
      recentClubs: recentClubsRaw.map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        memberCount: c._count.applications,
        imageUrl: c.images[0]?.url ?? null,
        keyword: firstKeyword(c.tags),
      })),
      recentClubsTotal,
      recentPosts: recentPostsRaw.map((p) => ({
        id: p.id,
        category: p.category,
        snippet: p.content.slice(0, 90),
        authorName: p.isAnonymous ? "익명" : p.user?.nickname ?? "탈퇴한 멤버",
        avatarUrl: p.isAnonymous ? null : p.user?.avatarUrl ?? null,
        systemType: p.systemType,
        createdAt: p.createdAt.toISOString(),
        reactionCount: p._count.intercessions,
        commentCount: p._count.comments,
        // 이미지는 익명 글도 그대로 노출(광장 본편과 동일) — 신원 마스킹은 이름·아바타·배지에만 적용.
        imageUrl: p.images[0]?.url ?? null,
        imageCount: p._count.images,
        isAnswered: p.isAnswered,
        isAnonymous: p.isAnonymous,
        authorRole: p.isAnonymous ? null : ((p.user?.role ?? null) as Role | null),
        isNewcomer: p.isAnonymous ? false : isNewcomer(p.user?.membershipDecidedAt ?? null),
      })),
      prompt: promptRaw
        ? { id: promptRaw.id, question: promptRaw.question, answerCount: promptRaw._count.answers }
        : null,
    };
  },
  ["home-global-feed"],
  { revalidate: 60, tags: [HOME_FEED_TAG] },
);

export async function getFeedData(dbUserId: string): Promise<FeedData> {
  const me = dbUserId;
  const now = new Date();

  // 내 동아리 id(소유 + accepted 멤버) + 전역 피드(대개 캐시 히트)를 한 배치로 병렬.
  const [owned, memberApps, global, reportCount] = await Promise.all([
    prisma.club.findMany({ where: { ownerUserId: me, isActive: true }, select: { id: true } }),
    prisma.clubApplication.findMany({
      where: { userId: me, status: "accepted" },
      select: { clubId: true },
    }),
    getGlobalFeed(),
    // 승인 직후 홈에서 '성향 카드 만들기' 유도 CTA를 띄우기 위한 플래그(0/1).
    // Report.userId는 비유니크지만 생성 API가 deleteMany→create로 1장만 유지하므로 count>0로 충분.
    prisma.report.count({ where: { userId: me } }),
  ]);

  const myClubIds = [...new Set([...owned.map((c) => c.id), ...memberApps.map((a) => a.clubId)])];

  // 다가오는 모임만 내 동아리 id 집합에 의존 — 위 배치 이후 단독 조회.
  const upcomingMeetings = myClubIds.length
    ? await prisma.clubMeeting.findMany({
        where: { clubId: { in: myClubIds }, meetsAt: { gte: now } },
        orderBy: { meetsAt: "asc" },
        take: 3,
        select: {
          id: true,
          clubId: true,
          title: true,
          meetsAt: true,
          place: true,
          club: { select: { name: true } },
        },
      })
    : [];

  return {
    hasPersonalityReport: reportCount > 0,
    upcomingMeetings: upcomingMeetings.map((m) => ({
      id: m.id,
      clubId: m.clubId,
      clubName: m.club.name,
      title: m.title,
      meetsAt: m.meetsAt.toISOString(),
      place: m.place,
    })),
    ...global,
  };
}
