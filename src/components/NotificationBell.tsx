"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { NOTIFICATIONS_CHANGED_EVENT } from "@/lib/notificationTabs";

type Notice = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

// type별 아이콘. lib/notifications.ts의 NotificationType과 동기화한다.
const ICON: Record<string, string> = {
  membership_approved: "🎉",
  membership_rejected: "💌",
  club_application_received: "📨",
  club_application_accepted: "🎉",
  club_application_rejected: "💌",
  club_meeting_created: "📅",
  club_meeting_reminder: "⏰",
  club_member_removed: "🚪",
  club_member_left: "👋",
  club_ownership_received: "👑",
  prayer_comment: "💬",
  prayer_comment_reply: "↩️",
  prayer_intercession: "🙏",
  announcement: "📢",
  admin_membership_applied: "📝",
  admin_member_withdrawn: "🚪",
  admin_club_created: "🏛️",
  admin_content_reported: "🚨",
  admin_support_ticket_created: "🎧",
  support_reply: "🎧",
};

// 운영자 전용 알림(admin_*) — 벨 목록에서 살짝 다른 톤으로 구분 표시.
function isAdminNotice(type: string): boolean {
  return type.startsWith("admin_");
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}일 전`;
  return new Date(iso).toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
}

/**
 * 헤더 알림 벨 — 본인 알림 최근 20건(읽음 포함)과 미읽음 배지를 보여준다.
 * 항목 클릭 시 link로 이동하며 해당 건을 읽음 처리. 비로그인은 렌더 안 함.
 * (가입 승인/거절·동아리 신청·새 모임·광장 댓글/공감 등 도메인 이벤트를 한 곳에 모음)
 */
export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [hasCookie, setHasCookie] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const reqRef = useRef(0);

  const load = useCallback(() => {
    const myReq = ++reqRef.current;
    fetch("/api/notifications", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        // 더 최신 요청이 진행 중이면 이 응답은 버린다(순서 역전 방지).
        if (myReq !== reqRef.current || !j?.ok) return;
        setItems((j.items as Notice[]) ?? []);
        setUnread(j.unreadCount ?? 0);
        setLoaded(true);
      })
      .catch(() => {});
  }, []);

  // 마운트 시: 비로그인이면 스킵, 로그인이면 배지 표시용으로 1회 로드.
  useEffect(() => {
    if (!/sb-[a-z0-9-]+-auth-token/i.test(document.cookie)) return;
    setHasCookie(true);
    load();
  }, [load]);

  // 패널을 열 때마다 최신 알림을 재조회 — Header가 layout에 상주해 SPA 내비게이션 중
  // 언마운트되지 않으므로, 새로고침 없이도 도착한 새 알림을 반영한다.
  useEffect(() => {
    if (open && hasCookie) load();
  }, [open, hasCookie, load]);

  // 외부 클릭 시 패널 닫기
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  async function markAllRead() {
    if (unread === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnread(0);
    try {
      await fetch("/api/notifications/read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // ids 없음 → 본인 미읽음 전체 읽음
      });
    } catch {
      /* 실패해도 다음 방문 시 다시 미읽음으로 보일 뿐 */
    } finally {
      // 하단 탭바 배지도 폴링을 기다리지 않고 바로 갱신되도록 알림.
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
    }
  }

  async function handleClick(n: Notice) {
    setOpen(false);
    if (!n.isRead) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      try {
        await fetch("/api/notifications/read", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: [n.id] }),
        });
      } catch {
        /* best-effort */
      } finally {
        window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
      }
    }
    if (n.link) router.push(n.link);
  }

  if (!hasCookie) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="glass-soft relative flex h-9 w-9 items-center justify-center rounded-xl text-ink-soft transition-colors hover:text-skyx-ink"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={unread > 0 ? `알림 ${unread}개 (안 읽음 있음)` : "알림"}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 3a6 6 0 0 0-6 6c0 3.5-1 5-2 6h16c-1-1-2-2.5-2-6a6 6 0 0 0-6-6Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M9.5 18a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-gold-deep px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="glass-card absolute right-0 top-[calc(100%+0.5rem)] z-[60] w-80 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
          style={{ background: "rgba(255,255,255,.95)" }}
        >
          <div className="flex items-center justify-between border-b border-sky-line px-4 py-2.5">
            <span className="text-sm font-bold text-ink">알림</span>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs text-skyx-ink hover:underline">
                모두 읽음
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {!loaded ? (
              <div className="px-4 py-8 text-center text-xs text-ink-faint">불러오는 중…</div>
            ) : items.length === 0 ? (
              <div className="px-4 py-10 text-center text-sm text-ink-soft">새 알림이 없어요.</div>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-white/90 ${
                    isAdminNotice(n.type) ? "bg-gold/[0.06]" : n.isRead ? "" : "bg-skyx/[0.06]"
                  }`}
                >
                  <span className="mt-0.5 shrink-0 text-lg" aria-hidden>
                    {ICON[n.type] ?? "🔔"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">
                      {isAdminNotice(n.type) && (
                        <span className="mr-1.5 rounded-full bg-gold/20 px-1.5 py-0.5 text-[10px] font-bold text-gold-ink">
                          운영
                        </span>
                      )}
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-ink-soft">
                        {n.body}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-ink-faint">{timeAgo(n.createdAt)}</p>
                  </div>
                  {!n.isRead && (
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold-deep"
                      aria-label="안 읽음"
                    />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
