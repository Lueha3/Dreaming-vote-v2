"use client";

import { useState } from "react";
import { RoleBadge } from "@/components/RoleBadge";
import { displayRoles } from "@/lib/roles";
import { timeAgo } from "@/lib/time";
import { SupportReplies } from "./SupportReplies";
import type { SupportTicket } from "./types";

export function SupportTicketCard({
  ticket,
  isStaff,
  onDelete,
  onReplyDelta,
}: {
  ticket: SupportTicket;
  isStaff: boolean;
  onDelete: (ticket: SupportTicket) => void;
  onReplyDelta: (ticketId: string, delta: number) => void;
}) {
  const [repliesOpen, setRepliesOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const answered = ticket.replyCount > 0;

  return (
    <li
      id={ticket.id}
      className={`glass-card scroll-mt-24 p-5 transition-all ${answered ? "border-teal/45!" : ""}`}
    >
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          {ticket.authorAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={ticket.authorAvatar}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-6 w-6 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-skyx/25 text-xs text-skyx-ink">
              {ticket.authorName[0]}
            </div>
          )}
          <span className="max-w-full truncate text-xs text-ink-soft">{ticket.authorName}</span>
          {displayRoles(ticket.authorRole).map((r) => (
            <RoleBadge key={r} role={r} size="sm" />
          ))}
          <span className="shrink-0 whitespace-nowrap text-xs text-ink-faint">
            · {timeAgo(ticket.createdAt)}
          </span>
          {ticket.isSecret && (
            <span className="shrink-0 whitespace-nowrap rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold text-gold-ink">
              🔒 비밀글
            </span>
          )}
        </div>
        {ticket.canDelete && (
          <div className="shrink-0">
            {confirmDelete ? (
              <span className="flex items-center gap-1.5 text-xs">
                <button onClick={() => onDelete(ticket)} className="font-medium text-red-500 hover:text-red-400">
                  삭제
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-ink-faint hover:text-ink">
                  취소
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-ink-faint transition-colors hover:text-red-500"
              >
                삭제
              </button>
            )}
          </div>
        )}
      </div>

      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink">{ticket.content}</p>

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => setRepliesOpen((o) => !o)}
          className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all ${
            repliesOpen
              ? "bg-skyx/20 text-skyx-ink ring-1 ring-skyx/40"
              : answered
                ? "border border-teal/35 bg-teal/10 text-teal-ink"
                : "glass-soft text-ink-soft hover:bg-white/90 hover:text-ink"
          }`}
        >
          🎧 {answered ? "답변완료" : "답변대기"}
          {ticket.replyCount > 0 && <span className="text-ink-faint">· {ticket.replyCount}</span>}
        </button>
      </div>

      {repliesOpen && (
        <SupportReplies
          ticketId={ticket.id}
          isStaff={isStaff}
          onCountChange={(delta) => onReplyDelta(ticket.id, delta)}
        />
      )}
    </li>
  );
}
