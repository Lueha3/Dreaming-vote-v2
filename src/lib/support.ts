import { hasAtLeast } from "@/lib/roles";
import type { AuthUser } from "@/lib/auth";

/**
 * 요청자가 이 문의를 볼 권한이 있는지 — 고객센터의 모든 라우트(목록·답글 조회·삭제)가
 * 공유하는 단일 규칙. 한 곳이라도 이 규칙을 안 쓰면, 목록에는 안 보이던 비밀글의 존재를
 * 403/404 응답 차이로 확인할 수 있는 구멍이 생긴다(실제로 DELETE에서 그렇게 새고 있었다 —
 * 2026-08 리뷰에서 발견). 그래서 "못 봄"과 "존재 안 함"은 항상 같은 404로 응답해야 한다.
 */
export function canSeeTicket(ticket: { userId: string; isSecret: boolean }, user: AuthUser | null): boolean {
  if (!user) return false;
  if (hasAtLeast(user.role, "staff")) return true;
  if (ticket.userId === user.dbUserId) return true;
  if (ticket.isSecret) return false;
  return user.membershipStatus === "approved";
}
