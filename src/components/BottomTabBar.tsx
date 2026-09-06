"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { TabIcon, type TabIconKey } from "@/components/icons";
import {
  NOTIFICATION_TAB_LINK_PREFIXES,
  NOTIFICATIONS_CHANGED_EVENT,
  type NotificationTabKey,
} from "@/lib/notificationTabs";
import { triggerHaptic } from "@/lib/haptics";
import { FEATURES } from "@/lib/features";

function hasAuthCookie() {
  return /sb-[a-z0-9-]+-auth-token/i.test(document.cookie);
}
function subscribeNoop() {
  return () => {};
}

// 탭바가 상주하는 동안 배지 수를 주기적으로 다시 불러오는 간격.
const BADGE_POLL_MS = 45_000;

const TABS: { href: string; label: string; icon: TabIconKey; exact: boolean; badgeKey?: NotificationTabKey }[] = [
  { href: "/", label: "홈", icon: "home", exact: true },
  ...(FEATURES.plaza
    ? [{ href: "/prayer", label: "광장", icon: "plaza" as const, exact: false, badgeKey: "plaza" as const }]
    : []),
  { href: "/clubs", label: "동아리", icon: "clubs", exact: false, badgeKey: "clubs" },
  { href: "/people", label: "멤버", icon: "members", exact: false },
  { href: "/my", label: "내정보", icon: "my", exact: false, badgeKey: "my" },
];

/**
 * 모바일 전용 하단 탭바 — 자주 쓰는 5곳을 엄지 닿는 자리로 꺼낸다.
 * 나머지(공지·설명서·운영관리·로그아웃)는 기존 헤더 햄버거 메뉴에 그대로 남긴다.
 * 로그인 쿠키가 없으면(비로그인 방문자) 렌더하지 않음 — Header/NotificationBell과 동일한 판정 방식.
 *
 * 광장/동아리/내정보 탭에는 카카오톡 채팅탭처럼 새 소식 개수 배지를 단다 — 새 댓글·가입 신청·
 * 모임 공지 등 해당 카테고리의 미읽음 알림 수(NOTIFICATION_TAB_LINK_PREFIXES 분류).
 * 탭을 눌러 들어가면 그 카테고리를 즉시 읽음 처리해 배지가 사라진다.
 */
export function BottomTabBar() {
  const pathname = usePathname();
  // pathname이 바뀔 때마다 리렌더되므로(usePathname 자체가 그 역할) 별도 effect 없이
  // 렌더 시점마다 쿠키를 다시 읽어 내비게이션 직후의 로그인 상태 변화도 반영한다.
  const loggedIn = useSyncExternalStore(subscribeNoop, hasAuthCookie, () => false);
  const [counts, setCounts] = useState<Partial<Record<NotificationTabKey, number>>>({});
  const reqRef = useRef(0);

  const loadCounts = useCallback(() => {
    const myReq = ++reqRef.current;
    fetch("/api/notifications/tab-counts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (myReq !== reqRef.current || !j?.ok) return;
        setCounts(j.counts ?? {});
      })
      .catch(() => {});
  }, []);

  // 로그인 상태에서만: 마운트 시 1회 + 주기적 폴링 + 헤더 알림 벨이 뭔가 읽음 처리하면
  // (NOTIFICATIONS_CHANGED_EVENT) 폴링을 기다리지 않고 바로 재조회.
  // 탭바는 layout에 상주해 페이지 이동에도 언마운트되지 않으므로 계속 최신 상태를 유지한다.
  useEffect(() => {
    if (!loggedIn) return;
    loadCounts();
    const id = setInterval(loadCounts, BADGE_POLL_MS);
    window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, loadCounts);
    return () => {
      clearInterval(id);
      window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, loadCounts);
    };
  }, [loggedIn, loadCounts]);

  function handleTabClick(badgeKey: NotificationTabKey | undefined) {
    triggerHaptic();
    if (!badgeKey || !counts[badgeKey]) return;
    // 낙관적으로 즉시 지우고, 서버에는 best-effort로 반영(실패해도 다음 폴링에서 복원될 뿐).
    setCounts((prev) => ({ ...prev, [badgeKey]: 0 }));
    fetch("/api/notifications/read", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefixes: NOTIFICATION_TAB_LINK_PREFIXES[badgeKey] }),
    })
      .then(() => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT)))
      .catch(() => {});
  }

  if (!loggedIn) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex sm:hidden"
      style={{
        paddingBottom: "env(safe-area-inset-bottom)",
        background: "rgba(255,255,255,.75)",
        backdropFilter: "blur(16px) saturate(1.4)",
        WebkitBackdropFilter: "blur(16px) saturate(1.4)",
        borderTop: "1px solid rgba(255,255,255,.9)",
        boxShadow: "0 -8px 24px -12px rgba(74,144,194,.25)",
      }}
      aria-label="주요 메뉴"
    >
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        const badgeCount = t.badgeKey ? (counts[t.badgeKey] ?? 0) : 0;
        return (
          <Link
            key={t.href}
            href={t.href}
            onClick={() => handleTabClick(t.badgeKey)}
            className={`mx-1 my-1.5 flex flex-1 flex-col items-center gap-0.5 rounded-2xl py-1.5 text-[10.5px] font-semibold transition-all ${
              active ? "bg-skyx/15 text-skyx-ink" : "text-ink-faint"
            }`}
          >
            <span className="relative flex">
              <TabIcon
                name={t.icon}
                active={active}
                className={`h-[22px] w-[22px] transition-transform ${active ? "-translate-y-0.5 scale-[1.08]" : ""}`}
              />
              {badgeCount > 0 && (
                <span
                  className="absolute -right-1.5 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gold-deep px-1 text-[9.5px] font-bold leading-none text-white"
                  aria-label={`새 소식 ${badgeCount}개`}
                >
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              )}
            </span>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
