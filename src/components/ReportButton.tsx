"use client";

import { useState } from "react";
import { fetchJson } from "@/lib/http";

type Props = {
  targetType: "prayer" | "comment" | "club";
  targetId: string;
  label?: string;
  // ⋯ 메뉴 등 외부에서 "이미 펼친 상태"로 띄우고 싶을 때. 취소/제출 시 onClose로 부모가 걷어낸다.
  forceOpen?: boolean;
  onClose?: () => void;
  /**
   * 접수 성공 시점 알림. forceOpen으로 띄운 경우 제출 직후 onClose로 이 컴포넌트가
   * 걷혀버려 아래 '신고 접수됨' 표시가 렌더될 기회가 없다 — 그 확인을 부모가
   * 대신 남길 수 있도록 성공을 따로 알린다(취소와 구분되지 않는 onClose로는 불가능).
   */
  onSubmitted?: () => void;
};

/**
 * 신고 버튼 — 클릭 시 사유 입력 폼을 펼쳐 POST /api/moderation/report.
 * 광장 글/댓글/동아리 어디에나 드롭인. 접수되면 '신고 접수됨'으로 고정.
 */
export function ReportButton({
  targetType,
  targetId,
  label = "신고",
  forceOpen,
  onClose,
  onSubmitted,
}: Props) {
  const [open, setOpen] = useState(!!forceOpen);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setOpen(false);
    onClose?.();
  }

  async function submit() {
    if (!reason.trim()) {
      setError("신고 사유를 입력해주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await fetchJson("/api/moderation/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason: reason.trim() }),
      });
      setDone(true);
      setOpen(false);
      onSubmitted?.();
      onClose?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "신고에 실패했어요.");
    }
    setBusy(false);
  }

  if (done) {
    return <span className="text-xs text-ink-faint">신고 접수됨</span>;
  }

  if (!open) {
    // forceOpen으로 띄웠다가 닫힌 경우엔 부모가 이 컴포넌트를 걷어내므로 트리거 버튼을 다시 보여줄 필요 없음.
    if (forceOpen !== undefined) return null;
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-ink-faint transition-colors hover:text-red-500"
      >
        {label}
      </button>
    );
  }

  return (
    <div className="mt-2 w-full space-y-2 rounded-lg border border-sky-line bg-white/70 p-2.5">
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="신고 사유를 적어주세요 (운영진만 확인해요)"
        className="w-full rounded-lg border border-white/95 bg-white/80 px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
        autoFocus
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex justify-end gap-1.5">
        <button
          onClick={() => {
            cancel();
            setError(null);
          }}
          className="glass-soft rounded-lg px-2.5 py-1 text-xs text-ink-soft hover:text-ink"
        >
          취소
        </button>
        <button
          onClick={submit}
          disabled={busy}
          className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 transition-all hover:bg-red-100 disabled:opacity-50"
        >
          {busy ? "접수 중…" : "신고 제출"}
        </button>
      </div>
    </div>
  );
}
