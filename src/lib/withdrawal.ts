import { prisma } from "@/lib/db";

/**
 * 회원 탈퇴 처리 — 자진 탈퇴(/api/my/withdraw)와 강제 탈퇴(/api/manage/members/[id]/withdraw) 공용.
 *
 * DB는 마이그레이션 20260810103229(fix_withdrawal_resurrection)로 다음 제약을 강제한다:
 *
 *   CHECK ( ("supabaseId" LIKE 'withdrawn:%') = ("deletedAt" IS NOT NULL) )
 *
 * 즉 deletedAt을 찍으려면 supabaseId도 반드시 툼스톤(withdrawn:<id>)이어야 한다.
 * Prisma 스키마로는 CHECK를 표현할 수 없어 코드에서 이 계약을 지켜야 하고,
 * 어긴 채로 update하면 23514로 탈퇴 전체가 실패한다(실제로 그렇게 깨져 있었다).
 *
 * 툼스톤이 핵심인 이유: supabaseId의 UNIQUE 슬롯을 반납해야 같은 구글 계정으로
 * 다시 로그인할 때 이 행이 매칭되지 않고 새 User 행이 생긴다. 예전처럼 로그인만으로
 * 탈퇴가 취소되어 권한·이력을 그대로 되찾는 '부활'을 구조적으로 막는다.
 *
 * 글·댓글·후기 등 공동체 콘텐츠는 남긴다(작성자 표시는 "탈퇴한 멤버"로 파생).
 * 반면 개인에게 귀속된 부수 데이터는 지운다 — 특히 PushSubscription을 남기면
 * 탈퇴 후에도 푸시가 계속 간다.
 */
export async function withdrawUser(userId: string): Promise<void> {
  await prisma.$transaction([
    // 개인 귀속 데이터 제거 (마이그레이션의 정리 대상과 동일)
    prisma.clubApplication.deleteMany({ where: { userId } }),
    prisma.clubMeetingRsvp.deleteMany({ where: { userId } }),
    prisma.pushSubscription.deleteMany({ where: { userId } }),
    prisma.notification.deleteMany({ where: { userId } }),
    prisma.clubRecommendation.deleteMany({ where: { userId } }),

    // 소유 동아리 비공개 처리 (탈퇴자 동아리 자동 숨김)
    prisma.club.updateMany({ where: { ownerUserId: userId }, data: { isActive: false } }),

    // PII 파기 + 툼스톤. role 리셋은 필수 — role이 남으면 membershipGate/roleGate가
    // membershipStatus와 무관하게 통과시켜 PII 없는 유령 계정이 운영진 권한을 유지한다.
    prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        supabaseId: `withdrawn:${userId}`, // ← CHECK 제약과 짝을 이룬다
        membershipStatus: "withdrawn",
        role: "member",
        nickname: null,
        avatarUrl: null,
        realName: null,
        age: null,
        approvedAge: null,
        gender: null,
        dreamGroup: null,
        phone: null,
        birthMonth: null,
        birthDay: null,
        membershipAppliedAt: null,
        membershipDecidedAt: null,
        membershipNote: null,
        startPromptSeenAt: null,
      },
    }),
  ]);
}
