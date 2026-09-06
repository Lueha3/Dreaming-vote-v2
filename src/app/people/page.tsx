"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ApiError, fetchJson } from "@/lib/http";
import { NewcomerBadge } from "@/components/NewcomerBadge";

type Person = {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  group: string | null;
  dreamGroup: string | null;
  isNewcomer: boolean;
  catchphrase: string | null;
  clubCount: number;
};

/**
 * 멤버 둘러보기 — 승인 멤버만. v2에서는 정렬 탭(비슷한 성향·같은 꿈터·새가족 먼저)을 빼고
 * 단순 목록만 남겼다. 순서는 서버가 닉네임순으로 내려준다.
 */
export default function PeoplePage() {
  const [items, setItems] = useState<Person[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [needJoin, setNeedJoin] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setNeedJoin(false);
    try {
      const data = await fetchJson<{ ok: true; items: Person[] }>("/api/people");
      setItems(data.items ?? []);
    } catch (e) {
      if (e instanceof ApiError && e.code === "membership_required") setNeedJoin(true);
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (needJoin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-14 text-center">
        <div className="glass-card p-8">
          <div className="mb-3 text-3xl">🧑‍🤝‍🧑</div>
          <p className="mb-1.5 text-base font-bold text-ink">멤버 둘러보기는 승인 멤버만 볼 수 있어요</p>
          <p className="mb-5 text-sm leading-relaxed text-ink-soft">
            가입 승인을 받으면 청년부 멤버들을 둘러볼 수 있어요.
          </p>
          <Link href="/join" className="btn-gold btn-glow inline-block rounded-full px-6 py-3 text-sm font-bold">
            가입 신청하러 가기 →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6">
        <h1 className="mb-1.5 text-2xl font-extrabold text-ink">
          <span className="gradient-text">멤버 둘러보기</span>
        </h1>
        <p className="text-sm text-ink-soft">우리 청년부 멤버들을 둘러보세요.</p>
      </div>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-card h-28 animate-pulse p-5" />
          ))}
        </div>
      ) : !items || items.length === 0 ? (
        <div className="glass-card px-8 py-14 text-center text-sm text-ink-soft">
          아직 표시할 멤버가 없어요.
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((p) => (
            <li key={p.id} className="glass-card p-4">
              <div className="mb-2 flex items-center gap-2.5">
                {p.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img loading="lazy" decoding="async" src={p.avatarUrl} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-skyx/20 text-sm text-skyx-ink">
                    {p.nickname?.[0] ?? "?"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{p.nickname ?? "멤버"}</p>
                  <div className="flex flex-wrap items-center gap-1 text-xs text-ink-faint">
                    {p.group && <span>{p.group}</span>}
                    {p.dreamGroup && <span>· {p.dreamGroup}</span>}
                  </div>
                </div>
                {p.isNewcomer && <NewcomerBadge size="sm" />}
              </div>
              {p.catchphrase && (
                <p className="mb-2 line-clamp-2 text-xs leading-relaxed text-ink-soft">
                  &ldquo;{p.catchphrase}&rdquo;
                </p>
              )}
              <p className="text-[11px] text-ink-faint">가입 동아리 {p.clubCount}개</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
