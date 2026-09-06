"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Link from "next/link";
import { fetchJson } from "@/lib/http";
import { RoleBadge } from "@/components/RoleBadge";
import { NewcomerBadge } from "@/components/NewcomerBadge";
import type { Role } from "@/lib/roles";
import { FEATURES } from "@/lib/features";

type PeekProfile = {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  role: Role;
  group: string | null;
  dreamGroup: string | null;
  isNewcomer: boolean;
  catchphrase: string | null;
  traits: string[];
  activityLine: string;
};

type Ctx = { open: (userId: string) => void };
const ProfilePeekContext = createContext<Ctx | null>(null);

/** 아바타 탭 → 미니 프로필 바텀시트. 어디서든 이 훅으로 열 수 있다. */
export function useProfilePeek(): Ctx {
  const ctx = useContext(ProfilePeekContext);
  if (!ctx) throw new Error("useProfilePeek는 ProfilePeekProvider 하위에서만 사용할 수 있어요.");
  return ctx;
}

/**
 * 앱 전역에 1개만 마운트(layout.tsx) — 멤버 목록·동아리 어디서 아바타를 탭해도
 * 같은 바텀시트 하나를 재사용한다(글마다 별도 시트를 만들지 않음).
 */
export function ProfilePeekProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PeekProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const open = useCallback((id: string) => {
    setUserId(id);
    setProfile(null);
    setNotFound(false);
    setLoading(true);
    fetchJson<{ ok: true; profile: PeekProfile }>(`/api/people/${id}`)
      .then((data) => setProfile(data.profile))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, []);

  const close = useCallback(() => setUserId(null), []);

  return (
    <ProfilePeekContext.Provider value={{ open }}>
      {children}
      {userId && (
        <div
          className="modal-fade-in fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(46,110,158,.28)] backdrop-blur-[2px] sm:items-center"
          onClick={close}
        >
          <div
            className="sheet-slide-in glass-card w-full max-w-sm rounded-b-none p-5 sm:rounded-b-[24px]"
            style={{ background: "rgba(255,255,255,.96)" }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="멤버 미니 프로필"
          >
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-ink-faint/30 sm:hidden" aria-hidden />

            {loading ? (
              <div className="flex items-center gap-3 py-6">
                <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-white/70" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-28 animate-pulse rounded-full bg-white/70" />
                  <div className="h-3 w-20 animate-pulse rounded-full bg-white/70" />
                </div>
              </div>
            ) : notFound || !profile ? (
              <p className="py-6 text-center text-sm text-ink-soft">프로필을 불러오지 못했어요.</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  {profile.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profile.avatarUrl} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-skyx/25 text-base text-skyx-ink">
                      {profile.nickname?.[0] ?? "?"}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{profile.nickname ?? "이름 미설정"}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {profile.group && (
                        <span className="rounded-full border border-skyx/45 bg-skyx/15 px-2 py-0.5 text-[10px] font-bold text-skyx-ink">
                          {profile.group}
                        </span>
                      )}
                      <RoleBadge role={profile.role} size="sm" />
                      {profile.isNewcomer && <NewcomerBadge size="sm" />}
                    </div>
                  </div>
                </div>

                {FEATURES.archetype && profile.catchphrase && (
                  <p className="mt-3 text-xs leading-relaxed text-ink-soft">
                    &ldquo;{profile.catchphrase}&rdquo;
                    {profile.traits.length > 0 && (
                      <span className="text-ink-faint"> · {profile.traits.join(", ")}</span>
                    )}
                  </p>
                )}

                <div className="mt-3 rounded-xl border border-white/90 bg-white/55 px-3 py-2.5">
                  <p className="text-[11px] font-semibold text-ink-faint">최근 활동</p>
                  <p className="mt-0.5 text-xs text-ink-soft">{profile.activityLine}</p>
                </div>

                <Link
                  href="/people"
                  onClick={close}
                  className="mt-2.5 block text-center text-xs font-medium text-ink-faint hover:text-skyx-ink"
                >
                  멤버 둘러보기 →
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </ProfilePeekContext.Provider>
  );
}
