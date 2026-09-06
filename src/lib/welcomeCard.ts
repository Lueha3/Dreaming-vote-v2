import { prisma } from "@/lib/db";
import { FEATURES } from "@/lib/features";

/**
 * 가입 승인 시 새가족 본인 명의로 광장(일상)에 환영 카드를 자동 게시.
 * 작성자를 새가족 본인으로 두는 게 핵심 트릭 — 댓글·공감이 달리면 기존
 * prayer_comment/prayer_intercession 알림 파이프라인이 그대로 동작해 새가족에게
 * "누가 나를 환영해줬어요" 푸시까지 공짜로 붙는다. 본인 글이므로 원치 않으면
 * 기존 삭제 권한으로 스스로 지울 수 있다(별도 옵트아웃 불필요).
 * best-effort — 호출부(승인 라우트)에서 try/catch로 감싸 실패해도 승인 자체는 유효.
 */
export async function createWelcomeCard(userId: string, nickname: string | null): Promise<void> {
  // 광장이 꺼져 있으면 카드를 올릴 지면이 없다 — 아무도 못 보는 글과 그 알림만 쌓이므로 만들지 않는다.
  if (!FEATURES.plaza) return;
  const name = nickname?.trim();
  await prisma.prayer.create({
    data: {
      userId,
      category: "일상",
      content: name
        ? `🎉 ${name}님이 새로 왔어요! 반갑게 맞아주세요 👋`
        : "🎉 새가족이 왔어요! 반갑게 맞아주세요 👋",
      systemType: "welcome",
      scope: "ALL",
    },
  });
}
