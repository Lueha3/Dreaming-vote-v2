"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FEATURES } from "@/lib/features";

/** '내 정보' 하위 섹션 — 클릭 시 각 상세 라우트로 이동(URL 유지·RSC 유지).
 *  성격유형 기능이 꺼져 있으면 성향카드 탭은 빠지고 /my는 /my/clubs로 보내진다(my/page.tsx). */
const TABS = [
  ...(FEATURES.archetype ? [{ href: "/my", label: "성향카드" }] : []),
  { href: "/my/clubs", label: "내 동아리" },
  { href: "/my/profile", label: "프로필 설정" },
];

export function MyTabs() {
  const pathname = usePathname();
  return (
    <div className="flex gap-2">
      {TABS.map((t) => {
        // /my는 정확히 일치할 때만 활성(=/my/clubs가 /my로 오인되지 않게).
        // 나머지는 하위 경로까지 활성으로(ManageNav와 동일 규칙·트레일링 슬래시 방어).
        const active = t.href === "/my" ? pathname === "/my" : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
              active
                ? "bg-skyx/25 text-skyx-ink ring-1 ring-skyx/40"
                : "glass-soft text-ink-soft hover:bg-white/90 hover:text-ink"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
