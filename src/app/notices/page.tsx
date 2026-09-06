import Link from "next/link";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { isEdited } from "@/lib/time";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "공지 — 동아리드림",
  description: "꿈꾸는교회 청년부 공지사항",
};

function fmtDate(d: Date) {
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Seoul",
  });
}

export default async function NoticesPage() {
  const rows = await prisma.announcement.findMany({
    where: { isPublished: true },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      body: true,
      isPinned: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { nickname: true } },
    },
  });

  return (
    <div className="relative min-h-screen overflow-hidden">
      <main className="relative mx-auto max-w-2xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-bold text-ink">📢 공지</h1>
          <Link href="/" className="text-xs text-ink-faint transition-colors hover:text-ink">
            ← 홈
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="glass-card px-6 py-16 text-center text-sm text-ink-soft">
            아직 등록된 공지가 없어요.
          </div>
        ) : (
          <ul className="space-y-3">
            {rows.map((a) => (
              <li key={a.id} className="glass-card p-5">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  {a.isPinned && (
                    <span className="rounded-full border border-gold/35 bg-gold/10 px-2 py-0.5 text-[10px] font-medium text-gold-ink">
                      📌 고정
                    </span>
                  )}
                  <h2 className="text-base font-semibold text-ink">{a.title}</h2>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-soft">
                  {a.body}
                </p>
                <p className="mt-3 text-[11px] text-ink-faint">
                  {a.author?.nickname ?? "운영팀"} · {fmtDate(a.createdAt)}
                  {isEdited(a.createdAt, a.updatedAt) && " · 수정됨"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
