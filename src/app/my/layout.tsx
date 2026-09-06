import { getAuthUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { RoleBadge } from "@/components/RoleBadge";
import { displayRoles } from "@/lib/roles";
import { MyTabs } from "./MyTabs";

// getAuthUser가 쿠키를 읽으므로 동적.
export const dynamic = "force-dynamic";

/**
 * '내 정보' 레이아웃 — (성향카드·)내 동아리·프로필 설정을 한 탭으로 통합.
 * 공통 신원 헤더(아바타·닉네임·인증마크)와 탭 바를 제공하고, 각 하위 라우트가 상세를 렌더한다.
 * 비로그인 시에는 탭/헤더 없이 각 페이지의 로그인 안내만 통과시킨다(레이아웃 패스스루).
 * getAuthUser는 React cache로 하위 페이지 호출과 1회로 합쳐져 DB 중복 조회가 없다.
 */
export default async function MyLayout({ children }: { children: React.ReactNode }) {
  const user = await getAuthUser();

  if (!user) return <>{children}</>;

  // 동아리장 배지는 전역 role이 아니라 활성 동아리 소유 여부로 파생(/api/membership과 동일 규칙).
  const ownedActiveClubs = await prisma.club.count({
    where: { ownerUserId: user.dbUserId, isActive: true },
  });
  const isClubLeader = ownedActiveClubs > 0;

  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="mx-auto max-w-2xl px-4 pt-10">
        {/* 신원 헤더 — 모든 탭 공통 */}
        <div className="mb-5 flex items-center gap-3">
          {user.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.avatarUrl}
              alt="프로필"
              className="h-11 w-11 rounded-full object-cover ring-2 ring-skyx/30"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-skyx/25 text-xl ring-2 ring-skyx/30">
              👤
            </div>
          )}
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-lg font-bold text-ink">{user.nickname ?? "나"}</p>
              {displayRoles(user.role, { isClubLeader }).map((r) => (
                <RoleBadge key={r} role={r} size="sm" />
              ))}
            </div>
            <p className="text-xs text-ink-soft">내 정보</p>
          </div>
        </div>

        <MyTabs />
      </div>
      {children}
    </div>
  );
}
