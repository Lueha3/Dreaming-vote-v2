import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth";
import { FEATURES } from "@/lib/features";
import { prisma } from "@/lib/db";
import { MyReportsList, type ReportItem } from "./MyReportsList";

// getAuthUser가 쿠키를 읽으므로 정적 프리렌더 불가 — 명시적으로 동적.
export const dynamic = "force-dynamic";

/**
 * 내 성향 카드(내 정보 > 성향카드 탭) — 서버 컴포넌트.
 * 신원 헤더·탭은 상위 레이아웃(my/layout.tsx)이 담당하고, 여기선 성향 카드 목록만 SSR.
 * PII(phone/realName/gender/age)는 select하지 않아 클라로 새지 않는다.
 */
export default async function MyPage() {
  // 성격유형 기능이 꺼져 있으면 성향카드 탭 자체가 없다 — 첫 탭(내 동아리)으로 보낸다.
  if (!FEATURES.archetype) redirect("/my/clubs");

  const user = await getAuthUser();

  /* ── 비로그인 ─────────────────────────────────────────────── */
  if (!user) {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
        <div className="relative px-6 text-center">
          <div className="mb-6 text-5xl">🔐</div>
          <h2 className="mb-3 text-2xl font-bold text-ink">로그인이 필요합니다</h2>
          <p className="mb-8 text-sm leading-relaxed text-ink-soft">
            내 성향 카드를 보려면 로그인을 해주세요.
          </p>
          <Link
            href="/login?next=/my"
            className="btn-gold btn-glow inline-block rounded-full px-6 py-3 text-sm font-semibold"
          >
            로그인하기
          </Link>
        </div>
      </div>
    );
  }

  const reportsRaw = await prisma.report.findMany({
    where: { userId: user.dbUserId },
    orderBy: { createdAt: "desc" },
    take: 1, // 최신 1장만 노출
    select: {
      shareSlug: true,
      catchphrase: true,
      coreTraits: true,
      sourceAi: true,
      isPublic: true,
      viewCount: true,
      createdAt: true,
    },
  });

  const items: ReportItem[] = reportsRaw.map((r) => ({
    shareSlug: r.shareSlug,
    catchphrase: r.catchphrase,
    coreTraits: r.coreTraits,
    sourceAi: r.sourceAi,
    viewCount: r.viewCount,
    isPublic: r.isPublic,
    createdAt: r.createdAt.toISOString(),
  }));

  const { membershipStatus } = user;

  /* ── 메인 ─────────────────────────────────────────────────── */
  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 pb-16">
        {/* 멤버십 배너 — 승인되면 숨김 */}
        {membershipStatus !== "approved" &&
          (membershipStatus === "pending" ? (
            <Link
              href="/join"
              className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-skyx/45 bg-skyx/15 px-4 py-3.5 transition-all hover:border-skyx/60"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">⏳</span>
                <div>
                  <p className="text-sm font-semibold text-skyx-ink">가입 승인을 기다리는 중이에요</p>
                  <p className="text-xs text-skyx-ink/70">
                    승인되면 닉네임(집단-나이-이름)이 자동으로 만들어져요
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-skyx-ink">신청 내용 보기 →</span>
            </Link>
          ) : (
            <Link
              href="/join"
              className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3.5 transition-all hover:border-gold/60"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-lg">⛪</span>
                <div>
                  <p className="text-sm font-semibold text-gold-ink">청년부 가입 신청을 해주세요</p>
                  <p className="text-xs text-gold-ink/70">
                    승인되면 닉네임(집단-나이-이름)이 자동으로 만들어져요 · 동아리 참여 전 필수
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-xs text-gold-ink">신청하기 →</span>
            </Link>
          ))}

        {/* 성향 카드 수 + 새로 만들기 */}
        <div className="mb-6 flex items-center justify-between">
          <p className="text-sm text-ink-soft">
            {items.length > 0 ? "성향 카드 1개" : "아직 성향 카드가 없어요"}
          </p>
          <Link href="/start" className="btn-gold btn-glow rounded-full px-4 py-2 text-xs font-semibold">
            + 새 성향 카드
          </Link>
        </div>

        {/* 리스트 (공개/비공개 토글만 클라이언트) */}
        <MyReportsList initialItems={items} />
    </main>
  );
}
