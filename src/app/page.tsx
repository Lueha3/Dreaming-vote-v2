import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AnnouncementBanner } from "@/components/AnnouncementBanner";
import { ChurchLineArt } from "@/components/ChurchLineArt";
import { HomeFeed, type HomeView } from "@/components/HomeFeed";
import { HomeShowcase, type ShowcaseStatus } from "@/components/home/HomeShowcase";
import { getAuthUser } from "@/lib/auth";
import { getFeedData } from "@/lib/feed";
import { NICKNAME_RE } from "@/lib/membership";
import { hasAtLeast } from "@/lib/roles";
import { SESSION_TIMEOUT_MESSAGE } from "@/lib/sessionTimeout";
import { FEATURES } from "@/lib/features";

/**
 * 자동 로그아웃 안내 — 랜딩 히어로 위에 한 줄. 다시 이동하면 자연히 사라진다.
 *
 * next가 있으면 '이어서 보기'를 함께 띄운다. 푸시 알림을 누르고 들어왔다가 만료로
 * 튕긴 경우가 여기 해당하는데, 이 버튼이 없으면 알림이 가리키던 글로 돌아갈 길이 없다.
 */
function SessionTimeoutNotice({ next }: { next: string | null }) {
  return (
    <div className="px-4 pt-3" role="status">
      <div className="glass-card mx-auto flex max-w-2xl flex-col items-center gap-2.5 px-4 py-3 text-center">
        <p className="text-xs leading-relaxed text-gold-ink">{SESSION_TIMEOUT_MESSAGE}</p>
        {next && (
          <a
            href={`/api/auth/login?next=${encodeURIComponent(next)}`}
            className="btn-gold rounded-full px-5 py-2 text-xs font-bold"
          >
            로그인하고 이어서 보기 →
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * 만료 리다이렉트가 붙여준 next를 되돌아갈 경로로 받아들일지 — 내부 절대경로만 허용한다.
 * 이 값은 결국 /api/auth/login?next=로 흘러가므로, 검사 없이 쓰면 로그인 직후 외부
 * 사이트로 튕기는 오픈 리다이렉트가 된다(auth/callback의 safeNextPath와 같은 원칙).
 */
function safeNext(raw: string | string[] | undefined): string | null {
  if (typeof raw !== "string" || !raw.startsWith("/")) return null;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return null;
  return raw;
}

// 승인 멤버용 — 피드 데이터를 서버에서 채워 스트리밍(Suspense).
async function ApprovedFeedSection({ userId }: { userId: string }) {
  const initial: HomeView = { kind: "approved", feed: await getFeedData(userId) };
  return <HomeFeed initial={initial} />;
}

const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/** KST 시간대별 인사 — 매일 똑같던 정적 히어로 대신 '나'와 '오늘'이 담긴 한 줄. */
function greetingParts(nickname: string | null): { date: string; line: string; emoji: string } {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const hour = kst.getUTCHours();
  const [line, emoji] =
    hour < 5
      ? (["늦은 밤이네요", "🌙"] as const)
      : hour < 11
        ? (["좋은 아침이에요", "☀️"] as const)
        : hour < 18
          ? (["오늘도 반가워요", "🌤️"] as const)
          : (["오늘 하루도 수고했어요", "🌆"] as const);

  // 닉네임 '집단-나이-이름'에서 이름만 — 형식이 아니면(구계정 폴백 등) 통째로 쓰지 않고 생략.
  const name = nickname?.match(NICKNAME_RE)?.[3] ?? null;

  return {
    date: `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일 ${DAY_LABELS[kst.getUTCDay()]}요일`,
    line: name ? `${name}님, ${line}` : line,
    emoji,
  };
}

/**
 * 홈(/) — 게이트 상태별 분기.
 *  - 비로그인·미가입·반려·승인대기: 방문자용 쇼케이스 랜딩(스크롤 시연 슬라이드 포함)
 *  - 승인 멤버(운영진 포함): 기존 피드 우선 홈 (콤팩트 히어로 + 활동 피드 스트리밍)
 */
export default async function Home({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getAuthUser();
  const isApprovedMember =
    !!user && (hasAtLeast(user.role, "staff") || user.membershipStatus === "approved");

  if (!isApprovedMember) {
    const status: ShowcaseStatus = !user
      ? "visitor"
      : user.membershipStatus === "pending"
        ? "pending"
        : "apply"; // none · rejected
    // 자동 로그아웃으로 밀려온 경우(?logout=idle) — 왜 튕겼는지 말해주지 않으면
    // 그냥 앱이 고장난 걸로 읽힌다.
    const sp = await searchParams;
    const timedOut = sp?.logout === "idle";
    return (
      <>
        {timedOut && <SessionTimeoutNotice next={safeNext(sp?.next)} />}
        <HomeShowcase status={status} />
      </>
    );
  }

  // 승인 후 최초 진입 1회 — 성격유형 고르기(/start)를 첫 화면으로 보여준다.
  // 표시 완료 기록은 /start가 실제 마운트될 때 클라이언트가 남긴다(StartWelcome).
  // 여기(RSC)에서 기록하면 링크 프리페치 렌더가 플래그를 소모해 실제 화면 노출 없이 끝나버린다.
  // 성격유형 기능이 꺼져 있으면 /start 자체가 막혀 있으므로 보내지 않는다(홈이 바로 첫 화면).
  if (FEATURES.archetype && !user.startPromptSeenAt) {
    redirect("/start?welcome=1");
  }

  const greet = greetingParts(user.nickname);

  return (
    <div className="relative min-h-screen overflow-hidden">
      <main className="relative mx-auto max-w-2xl px-4 py-8">
        {/* 전체 공지 배너 (최신 게시 1건, 닫기 가능) */}
        <AnnouncementBanner />

        {/* 개인화 인사 — 매스트헤드로 축소. 시선의 주인공은 바로 아래 '새로 생긴 동아리' 대문 캐러셀.
            골드 헤어라인이 '여기서부터 콘텐츠'를 알리고 브랜드 골드를 상시 노출한다. */}
        <div className="mb-3 mt-1">
          <p className="text-[11px] font-semibold text-ink-faint">
            {greet.date} · 오늘의 <span className="gradient-text font-bold">청년부</span>
          </p>
          <h1 className="mt-1.5 text-[21px] font-extrabold leading-tight tracking-tight text-ink sm:text-[24px]">
            {greet.line}{" "}
            <span aria-hidden className="align-middle text-[18px]">
              {greet.emoji}
            </span>
          </h1>
          <span
            aria-hidden
            className="mt-2.5 block h-[2px] w-16 rounded-full bg-gradient-to-r from-gold/80 via-teal/45 to-transparent"
          />
        </div>

        {/* 홈 본문: 피드를 서버에서 채워 스트리밍(Suspense).
            셸(히어로 등)은 즉시 표시되고, 피드는 준비되는 대로 같은 응답에 흘려보낸다. */}
        <Suspense fallback={<HomeFeed initial={{ kind: "loading" }} />}>
          <ApprovedFeedSection userId={user.dbUserId} />
        </Suspense>

        {/* 하단 교회 라인아트 (로고 오마주) */}
        <div className="mt-16 flex justify-center sm:mt-20" aria-hidden>
          <ChurchLineArt />
        </div>

        <p className="pb-6 pt-7 text-center text-[12.5px] font-medium text-ink/55">
          Dreaming Church <span className="mx-1 text-ink/30">·</span> 꿈꾸는교회 청년부{" "}
          <span className="mx-1 text-ink/30">·</span> 동아리드림
        </p>
      </main>
    </div>
  );
}
