"use client";

import { useEffect, useState } from "react";
import { fetchJson } from "@/lib/http";
import { FEATURES } from "@/lib/features";

type Stats = {
  users: number;
  reports: number;
  clubsTotal: number;
  clubsPending: number;
  clubsActive: number;
  appsTotal: number;
  appsAccepted: number;
  appsPending: number;
  recommendations: number;
};

type MetricSnapshot = {
  weekOf: string;
  newcomer90dRetention: number;
  crossCellInteractionRate: number;
  clubJoinRate: number;
  activeMemberCount: number;
};

/**
 * /manage/stats — 운영 지표(글래스). 데이터는 기존 /api/admin/stats 재사용
 * (/manage/clubs가 /api/admin/clubs를 재사용하는 패턴과 동일, 권한도 staff+로 동일).
 */
export default function ManageStatsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [snapshots, setSnapshots] = useState<MetricSnapshot[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchJson<{ ok: true; stats: Stats }>("/api/admin/stats").then((d) => d.stats),
      fetchJson<{ ok: true; snapshots: MetricSnapshot[] }>("/api/manage/metrics").then(
        (d) => d.snapshots,
      ),
    ])
      .then(([s, snaps]) => {
        setStats(s);
        setSnapshots(snaps);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="glass-card h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="glass-card px-8 py-14 text-center text-sm text-ink-soft">
        지표를 불러오지 못했어요.
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <Group title="정착·교류 추세 (최근 12주)">
        <MetricTrendCard
          label="새가족 90일 잔존율"
          snapshots={snapshots}
          field="newcomer90dRetention"
          unit="percent"
          accent="gold"
        />
        <MetricTrendCard
          label="크로스-꿈터 교류율"
          snapshots={snapshots}
          field="crossCellInteractionRate"
          unit="percent"
          accent="teal"
        />
        <MetricTrendCard
          label="동아리 참여율"
          snapshots={snapshots}
          field="clubJoinRate"
          unit="percent"
          accent="skyx"
        />
        <MetricTrendCard
          label="주간 활동 멤버"
          snapshots={snapshots}
          field="activeMemberCount"
          unit="count"
          accent="teal"
        />
      </Group>

      <Group title="서비스">
        <StatCard label="가입 유저" value={stats.users} accent="skyx" />
        {FEATURES.archetype && (
          <>
            <StatCard label="생성된 성향 카드" value={stats.reports} accent="teal" />
            <StatCard label="동아리 추천" value={stats.recommendations} accent="skyx" />
          </>
        )}
      </Group>

      <Group title="동아리">
        <StatCard label="전체 동아리" value={stats.clubsTotal} accent="skyx" />
        <StatCard
          label="승인 대기"
          value={stats.clubsPending}
          accent={stats.clubsPending > 0 ? "gold" : "muted"}
        />
        <StatCard label="모집 중" value={stats.clubsActive} accent="teal" />
      </Group>

      <Group title="동아리 가입 신청">
        <StatCard label="전체 신청" value={stats.appsTotal} accent="skyx" />
        <StatCard
          label="대기 중"
          value={stats.appsPending}
          accent={stats.appsPending > 0 ? "gold" : "muted"}
        />
        <StatCard label="수락됨" value={stats.appsAccepted} accent="teal" />
      </Group>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-ink-faint">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{children}</div>
    </div>
  );
}

const ACCENT: Record<string, string> = {
  gold: "text-gold-ink",
  teal: "text-teal-ink",
  skyx: "text-skyx-ink",
  muted: "text-ink-faint",
};

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: "gold" | "teal" | "skyx" | "muted";
}) {
  return (
    <div className="glass-card p-5">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`mt-1.5 text-3xl font-bold ${ACCENT[accent]}`}>{value.toLocaleString()}</p>
    </div>
  );
}

const BAR_ACCENT: Record<string, string> = {
  gold: "bg-gold/70",
  teal: "bg-teal/70",
  skyx: "bg-skyx/70",
};

function fmtWeekOf(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

/**
 * 지표 하나의 최근 12주 추세 — 큰 숫자(이번 주) + 미니 막대 스파크라인(주별 히스토리).
 * 스냅샷이 아직 없으면(첫 월요일 전) 안내만 표시.
 */
function MetricTrendCard({
  label,
  snapshots,
  field,
  unit,
  accent,
}: {
  label: string;
  snapshots: {
    weekOf: string;
    newcomer90dRetention: number;
    crossCellInteractionRate: number;
    clubJoinRate: number;
    activeMemberCount: number;
  }[] | null;
  field: "newcomer90dRetention" | "crossCellInteractionRate" | "clubJoinRate" | "activeMemberCount";
  unit: "percent" | "count";
  accent: "gold" | "teal" | "skyx";
}) {
  if (!snapshots || snapshots.length === 0) {
    return (
      <div className="glass-card p-5">
        <p className="text-xs text-ink-soft">{label}</p>
        <p className="mt-1.5 text-xs text-ink-faint">다음 월요일부터 쌓이기 시작해요.</p>
      </div>
    );
  }

  const values = snapshots.map((s) => s[field]);
  const latest = values[values.length - 1];
  const max = Math.max(...values, unit === "percent" ? 0.01 : 1);

  return (
    <div className="glass-card p-5">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`mt-1.5 text-3xl font-bold ${ACCENT[accent]}`}>
        {unit === "percent" ? `${Math.round(latest * 100)}%` : latest.toLocaleString()}
      </p>
      <div className="mt-3 flex h-8 items-end gap-1" title={`최근 ${snapshots.length}주`}>
        {values.map((v, i) => (
          <div
            key={snapshots[i].weekOf}
            className={`flex-1 rounded-t ${BAR_ACCENT[accent]}`}
            style={{ height: `${Math.max(10, (v / max) * 100)}%` }}
            title={`${fmtWeekOf(snapshots[i].weekOf)} · ${unit === "percent" ? `${Math.round(v * 100)}%` : v}`}
          />
        ))}
      </div>
      <p className="mt-1 text-[11px] text-ink-faint">
        {fmtWeekOf(snapshots[0].weekOf)} ~ {fmtWeekOf(snapshots[snapshots.length - 1].weekOf)}
      </p>
    </div>
  );
}
