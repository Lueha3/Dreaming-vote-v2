"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { RoleBadge } from "@/components/RoleBadge";
import { NotificationBell } from "@/components/NotificationBell";
import { canManage, displayRoles, type Role } from "@/lib/roles";
import { triggerHaptic } from "@/lib/haptics";
import { FEATURES } from "@/lib/features";



export function Header() {
  const pathname = usePathname();
  // 로그인 여부는 nickname 유무가 아니라 이 값으로 판단한다.
  // nickname은 Prisma 컬럼이 null일 수 있어(예: 폴백값도 없던 구계정) 로그인 판정 기준으로 쓰면
  // 로그인은 됐는데도 로그인 버튼이 계속 뜨고 로그아웃 진입점도 사라지는 버그가 생긴다.
  const [loggedIn, setLoggedIn] = useState(false);
  const [nickname, setNickname] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [membershipStatus, setMembershipStatus] = useState<string | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [isClubLeader, setIsClubLeader] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 인증 쿠키(sb-<ref>-auth-token[.n])가 전혀 없으면 비로그인 — 서버 왕복 없이 즉시 확정.
    // 비로그인 유저(외부 첫 유입 다수)의 모든 페이지에서 /api/membership 네트워크 홉을 제거한다.
    if (!/sb-[a-z0-9-]+-auth-token/i.test(document.cookie)) {
      setLoading(false);
      return;
    }
    // 로그인 여부·닉네임·멤버십 상태를 /api/membership 한 번으로 확정한다.
    // (예전: 클라 supabase.auth.getUser() → /api/membership 직렬 2왕복.
    //  membership 응답이 로그인 여부와 Prisma 닉네임을 모두 담으므로 클라 getUser 홉 제거.)
    // Header는 PII가 필요 없으므로 summary 응답(4필드)만 받는다 — 본인 PII 미전송.
    let alive = true;
    fetch("/api/membership?fields=summary", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!alive) return;
        if (json?.ok) {
          setLoggedIn(true);
          setMembershipStatus(json.membership.membershipStatus);
          setRole(json.membership.role ?? null);
          setIsClubLeader(!!json.membership.isClubLeader);
          // 닉네임은 가입 승인 시 자동 생성되는 Prisma 값이 진실.
          // 미승인 유저의 Prisma 닉네임은 첫 로그인 시 저장된 표시명(full_name) 폴백.
          setNickname(json.membership.nickname ?? null);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 페이지 이동 시 메뉴 닫기
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // 외부 클릭 시 메뉴 닫기
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // 클라 라우터 push+refresh는 같은 "/"에 이미 떠 있는 HomeFeed의 useState(initial)을
    // 리셋하지 못해(prop 변경이 lazy initializer를 다시 안 태움) 로그아웃 후에도 이전 피드가
    // 그대로 남는다. 풀 리로드로 모든 클라 상태를 확실히 비운다(AdminLogoutButton과 동일 패턴).
    window.location.href = "/";
  }

  return (
    <header
      className="sticky top-0 z-50 border-b border-white/70"
      style={{
        background: "rgba(255,255,255,.52)",
        backdropFilter: "blur(18px) saturate(1.5)",
        WebkitBackdropFilter: "blur(18px) saturate(1.5)",
        boxShadow: "0 4px 24px -12px rgba(74,144,194,.25)",
      }}
    >
      <div className="mx-auto flex w-full max-w-3xl items-center gap-1 px-2 py-2.5 sm:gap-2 sm:px-4">

        {/* 로고 — 꿈꾸는교회 로고 단독. 원본 PNG가 투명 배경이라 박스 없이 텍스트·그림만 띄운다.
            flex-shrink-0로 줄어들거나 잘리지 않게 고정. */}
        <Link href="/" className="flex flex-shrink-0 items-center">
          <img
            src="/dreaming-church.png"
            alt="꿈꾸는교회"
            className="block h-8 w-auto max-w-[100px] sm:h-10 sm:max-w-[136px]"
          />
        </Link>

        {/* 가입 신청하기는 홈 본문(HomeFeed)으로 옮겼지만, 로그인은 모든 활동의 선행조건이므로
            비로그인 유저가 어느 페이지에서든 즉시 찾을 수 있게 진입점을 카테고리 바에 유지한다(아래). */}

        {/* 우측 클러스터 (로그인/알림벨/햄버거) — 로고와 분리해 우측 끝으로(ml-auto) */}
        <div className="ml-auto flex flex-shrink-0 items-center gap-0.5 sm:gap-2">
          {/* 비로그인 — 로그인 버튼(가입 신청과 동일한 골드 톤). 로그인하면 사라지고
              그 자리를 알림 벨이 대체한다. */}
          {!loading && !loggedIn && (
            <Link href="/login" className="btn-gold rounded-full px-3.5 py-1.5 text-xs font-bold">
              로그인
            </Link>
          )}
          {/* 알림 벨 — 로그인 상태에서만 자체 렌더(비로그인은 null). menuRef 밖에 둬서
              벨 클릭이 햄버거 메뉴의 '외부 클릭'으로 인식돼 메뉴가 닫히게 한다(상호 배타). */}
          <NotificationBell />
          <div className="relative" ref={menuRef}>
          <button
            onClick={() => {
              triggerHaptic();
              setMenuOpen((o) => !o);
            }}
            className="glass-soft flex h-9 w-9 items-center justify-center rounded-xl text-ink-soft transition-colors hover:text-skyx-ink"
            aria-label="메뉴"
          >
            {menuOpen ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 4H14M2 8H14M2 12H14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            )}
          </button>

          {/* 드롭다운 메뉴 */}
          {menuOpen && (
            <div className="glass-card absolute right-0 top-[calc(100%+0.5rem)] w-56 py-2" style={{ background: "rgba(255,255,255,.92)" }}>
              {!loading && loggedIn && (
                <div className="mb-1 flex flex-wrap items-center gap-1.5 border-b border-sky-line px-4 pb-2">
                  <span className="text-xs font-medium text-ink-faint">회원</span>
                  <span className="truncate text-sm font-semibold text-ink">{nickname ?? "이름 미설정"}</span>
                  {displayRoles(role, { isClubLeader }).map((r) => (
                    <RoleBadge key={r} role={r} size="sm" />
                  ))}
                </div>
              )}
              <MobileNavLink href="/" onClick={() => setMenuOpen(false)}>🏠 홈</MobileNavLink>
              <MobileNavLink href="/clubs" onClick={() => setMenuOpen(false)}>👥 동아리 목록</MobileNavLink>
              <MobileNavLink href="/people" onClick={() => setMenuOpen(false)}>🧑‍🤝‍🧑 멤버 둘러보기</MobileNavLink>
              {FEATURES.plaza && (
                <MobileNavLink href="/prayer" onClick={() => setMenuOpen(false)}>🗣 광장</MobileNavLink>
              )}
              {FEATURES.archetype && (
                <MobileNavLink href="/start" onClick={() => setMenuOpen(false)}>🧭 성격유형 고르기</MobileNavLink>
              )}
              {/* 공지는 비로그인 유저도 볼 수 있어야 하므로 loggedIn 게이트 밖에 둔다. */}
              <MobileNavLink href="/notices" onClick={() => setMenuOpen(false)}>📢 공지</MobileNavLink>
              {!loading && loggedIn && membershipStatus && membershipStatus !== "approved" && (
                <MobileNavLink href="/join" onClick={() => setMenuOpen(false)}>
                  <span className="flex items-center justify-between w-full">
                    <span>{membershipStatus === "pending" ? "가입 승인 대기 중" : "청년부 가입 신청"}</span>
                    <span className="text-xs">{membershipStatus === "pending" ? "⏳" : "✋"}</span>
                  </span>
                </MobileNavLink>
              )}
              {/* 내 정보(+운영 관리)는 항상 로그아웃 바로 위에 오도록 마지막 그룹으로 둔다. */}
              {!loading && loggedIn && (
                <>
                  <div className="my-1.5 mx-4 border-t border-sky-line" />
                  <MobileNavLink href="/guide" onClick={() => setMenuOpen(false)}>📖 설명서</MobileNavLink>
                  <MobileNavLink href="/my" onClick={() => setMenuOpen(false)}>🪪 내 정보</MobileNavLink>
                  <MobileNavLink href="/support" onClick={() => setMenuOpen(false)}>🎧 고객센터</MobileNavLink>
                  {canManage(role) && (
                    <MobileNavLink href="/manage" onClick={() => setMenuOpen(false)}>
                      🛠 운영 관리
                    </MobileNavLink>
                  )}
                  <div className="my-1.5 mx-4 border-t border-sky-line" />
                  <button
                    onClick={handleLogout}
                    className="flex w-full items-center px-4 py-2.5 text-sm text-ink-faint transition-colors hover:bg-white/80 hover:text-ink"
                  >
                    로그아웃
                  </button>
                </>
              )}
            </div>
          )}
          </div>
        </div>

      </div>
    </header>
  );
}

function MobileNavLink({ href, onClick, children }: { href: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      onClick={() => {
        triggerHaptic();
        onClick();
      }}
      className="flex w-full items-center px-4 py-2.5 text-sm font-medium text-ink-soft transition-colors hover:bg-white/80 hover:text-ink"
    >
      {children}
    </Link>
  );
}
