import { prisma } from "@/lib/db";
import type { AuthUser } from "@/lib/auth";

export type AuditAction =
  | "role_change"
  | "membership_approve"
  | "membership_reject"
  | "membership_force_withdraw"
  | "club_approve"
  | "club_reject"
  | "club_update"
  | "club_transfer"
  | "club_member_remove"
  | "content_delete"
  | "roster_export";

/**
 * 신뢰 경계 변이를 감사 로그에 기록한다.
 * best-effort — 기록 실패가 본 작업(승인/역할변경 등)을 막지 않도록 호출부에서 try/catch.
 * 행위자 표시명/역할은 시점 스냅샷으로 비정규화 저장(행위자 삭제·개명에도 보존).
 */
export async function recordAudit(params: {
  actor: AuthUser | null;
  action: AuditAction;
  targetType: "user" | "club" | "prayer" | "comment" | "support_ticket" | "support_reply";
  targetId: string;
  summary: string;
  ip?: string | null;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: params.actor?.dbUserId ?? null,
      actorNickname: params.actor?.nickname ?? null,
      actorRole: params.actor?.role ?? null,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId,
      summary: params.summary,
      ip: params.ip ?? null,
    },
  });
}
