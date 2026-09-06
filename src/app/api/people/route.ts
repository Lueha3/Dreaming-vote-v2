import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAuthUser, membershipGate } from "@/lib/auth";
import { getGroup } from "@/lib/membership";
import { isNewcomer } from "@/lib/newcomer";
import { FEATURES } from "@/lib/features";

function parseTraits(coreTraits: string | undefined | null): string[] {
  return (coreTraits ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * GET /api/people
 * 멤버 둘러보기 — 승인 멤버만(공동체 로스터 노출은 개별 글 공개보다 보수적으로 다룬다).
 * 실명·전화 등 PII는 절대 포함하지 않는다. 성향은 Report.isPublic인 것만 노출.
 *
 * 정렬 탭(비슷한 성향·같은 꿈터·새가족 먼저)은 v2에서 뺐다 — 이 화면은 단순 목록만 한다.
 * 닉네임(집단-나이-이름) 순으로 내려주면 집단별로 자연히 묶인다.
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
  const gate = membershipGate(user);
  if (gate) return gate;

  // 성향(Report) 기반 값은 성격유형 기능이 켜져 있을 때만 계산한다.
  const me = FEATURES.archetype
    ? await prisma.user.findUnique({
        where: { id: user.dbUserId },
        select: { reports: { orderBy: { createdAt: "desc" }, take: 1, select: { coreTraits: true } } },
      })
    : null;
  const myTraits = new Set(parseTraits(me?.reports[0]?.coreTraits));

  const candidates = await prisma.user.findMany({
    where: { id: { not: user.dbUserId }, membershipStatus: "approved", deletedAt: null },
    select: {
      id: true,
      nickname: true,
      avatarUrl: true,
      approvedAge: true,
      dreamGroup: true,
      membershipDecidedAt: true,
      reports: {
        where: { isPublic: true },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { catchphrase: true, coreTraits: true },
      },
      _count: { select: { clubApplications: { where: { status: "accepted" } } } },
    },
    take: 500, // 대규모 커뮤니티에서도 쿼리 비용 보호(정렬은 이후 메모리에서)
  });

  const items = candidates.map((c) => {
    const traits = FEATURES.archetype ? parseTraits(c.reports[0]?.coreTraits) : [];
    return {
      id: c.id,
      nickname: c.nickname,
      avatarUrl: c.avatarUrl,
      group: c.approvedAge != null ? getGroup(c.approvedAge) : null,
      dreamGroup: c.dreamGroup,
      isNewcomer: isNewcomer(c.membershipDecidedAt),
      catchphrase: FEATURES.archetype ? (c.reports[0]?.catchphrase ?? null) : null,
      traitOverlap: traits.filter((t) => myTraits.has(t)).length,
      clubCount: c._count.clubApplications,
    };
  });

  // 닉네임 오름차순 — 닉네임이 없는(승인 전·탈퇴) 행은 목록에 없지만, 방어적으로 뒤로 보낸다.
  items.sort((a, b) => (a.nickname ?? "￿").localeCompare(b.nickname ?? "￿", "ko"));

  const publicItems = items;

  return NextResponse.json({ ok: true, items: publicItems });
}
