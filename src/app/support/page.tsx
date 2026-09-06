"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/lib/http";
import { SupportTicketCard } from "./SupportTicketCard";
import type { SupportTicket } from "./types";

type ListResponse = { ok: true; items: SupportTicket[]; isStaff: boolean };

export default function SupportPage() {
  const [items, setItems] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isStaff, setIsStaff] = useState(false);

  const [content, setContent] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isSecret, setIsSecret] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 목록 페치 실패에도 로그인 UI가 어긋나지 않도록 쿠키로 초기 힌트만 시드(서버가 최종 집행).
  useEffect(() => {
    if (/sb-[a-z0-9-]+-auth-token/i.test(document.cookie)) setLoggedIn(true);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchJson<ListResponse>("/api/support");
      setItems(data.items ?? []);
      setIsStaff(data.isStaff);
      setLoggedIn(true);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 알림 딥링크(/support#<id>)로 진입 시 해당 문의로 1회 스크롤.
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (loading || scrolledRef.current) return;
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) {
      scrolledRef.current = true;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [loading, items]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    const text = content.trim();
    if (!text || posting) return;
    setPosting(true);
    setError(null);
    try {
      await fetchJson("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: text, isAnonymous, isSecret }),
      });
      setContent("");
      setIsAnonymous(false);
      setIsSecret(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "올리지 못했어요. 다시 시도해주세요.");
    }
    setPosting(false);
  }

  async function removeTicket(ticket: SupportTicket) {
    setItems((prev) => prev.filter((x) => x.id !== ticket.id));
    try {
      await fetchJson(`/api/support/${ticket.id}`, { method: "DELETE" });
    } catch {
      await load(); // 실패 시 원복
    }
  }

  function replyDelta(ticketId: string, delta: number) {
    setItems((prev) =>
      prev.map((x) => (x.id === ticketId ? { ...x, replyCount: Math.max(0, x.replyCount + delta) } : x)),
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <main className="relative mx-auto max-w-2xl px-4 py-10">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink">🎧 고객센터</h1>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            궁금한 점이나 건의사항을 운영진에게 남겨주세요. 답글은 운영진만 달 수 있어요.
            <br />
            <span className="text-ink-faint">
              익명으로 쓰면 운영진에게도 신원이 보이지 않고, 비밀글로 쓰면 나와 운영진만 볼 수 있어요.
            </span>
          </p>
        </div>

        {loggedIn ? (
          <form onSubmit={handlePost} className="glass-card mb-6 p-4">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="문의하실 내용을 적어주세요..."
              className="w-full resize-none rounded-xl border border-white/95 bg-white/70 px-4 py-3 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className="h-4 w-4 rounded border-sky-line bg-white/70 accent-teal"
                  />
                  익명으로 올리기
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-soft">
                  <input
                    type="checkbox"
                    checked={isSecret}
                    onChange={(e) => setIsSecret(e.target.checked)}
                    className="h-4 w-4 rounded border-sky-line bg-white/70 accent-gold"
                  />
                  🔒 비밀글로 올리기
                </label>
              </div>
              <button
                type="submit"
                disabled={!content.trim() || posting}
                className="btn-gold rounded-xl px-5 py-2 text-sm disabled:opacity-40"
              >
                {posting ? "올리는 중..." : "올리기"}
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
          </form>
        ) : (
          <div className="glass-card mb-6 p-5 text-center">
            <p className="mb-3 text-sm text-ink-soft">문의를 남기려면 로그인이 필요해요.</p>
            <Link href="/login?next=/support" className="btn-gold inline-block rounded-full px-6 py-2.5 text-sm">
              로그인하기
            </Link>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-3xl bg-white/55" />
            ))}
          </div>
        ) : loggedIn && items.length === 0 ? (
          <div className="glass-card px-8 py-14 text-center">
            <div className="mb-3 text-4xl">🎧</div>
            <p className="text-sm text-ink-soft">아직 문의가 없어요.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((ticket) => (
              <SupportTicketCard
                key={ticket.id}
                ticket={ticket}
                isStaff={isStaff}
                onDelete={removeTicket}
                onReplyDelta={replyDelta}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
