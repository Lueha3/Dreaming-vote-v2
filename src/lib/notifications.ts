import { prisma } from "@/lib/db";
import { sendPushToUser, sendPushToUsers } from "@/lib/push";
import { getSuperadminEmails } from "@/lib/superadmin";
import { FEATURES } from "@/lib/features";

/**
 * 인앱 알림 타입. Header 알림 벨이 type별 아이콘을 그리는 데 쓴다.
 * 새 타입을 추가하면 NotificationBell의 ICON 맵에도 함께 추가한다.
 */
export type NotificationType =
  | "membership_approved"
  | "membership_rejected"
  | "club_application_received" // 내 동아리에 가입 신청이 들어옴 (→ 개설자)
  | "club_application_accepted" // 내 가입 신청이 수락됨 (→ 신청자)
  | "club_application_rejected" // 내 가입 신청이 반려됨 (→ 신청자)
  | "club_meeting_created" // 내가 속한 동아리에 새 모임 공지 (→ accepted 멤버)
  | "club_meeting_reminder" // 참석 표시한 모임 24h 전 리마인더 (→ going RSVP)
  | "club_member_removed" // 동아리에서 내보내짐 (→ 당사자)
  | "club_member_left" // 멤버가 동아리를 나감 (→ 개설자)
  | "club_ownership_received" // 동아리장이 됨 (→ 새 개설자)
  | "prayer_comment" // 내 광장 글에 댓글 (→ 글쓴이)
  | "prayer_comment_reply" // 내 댓글에 답글 (→ 댓글 작성자)
  | "prayer_intercession" // 내 광장 글에 첫 공감/기도 (→ 글쓴이)
  | "announcement" // 운영진 공지 브로드캐스트 (→ 승인 멤버 전원)
  | "admin_membership_applied" // 새 가입 신청 제출 (→ 운영진+)
  | "admin_member_withdrawn" // 회원 탈퇴(자진/강제) (→ 운영진+)
  | "admin_club_created" // 새 동아리 개설(승인 대기) (→ 운영진+)
  | "admin_content_reported" // 새 콘텐츠 신고 접수 (→ 운영진+)
  | "admin_support_ticket_created" // 새 고객센터 문의 접수 (→ 운영진+)
  | "support_reply"; // 내 고객센터 문의에 운영진 답글 (→ 문의 작성자)

type NotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  /** 클릭 시 이동할 앱 내부 경로(예: /clubs/<id>). 없으면 항목이 이동하지 않음. */
  link?: string | null;
};

/**
 * 단건 인앱 알림 생성.
 * best-effort 규약 — 알림 생성 실패가 본 작업(수락/공지/댓글 등)을 막지 않도록
 * 호출부에서 try/catch로 감싼다.
 */
export async function createNotification(input: NotificationInput): Promise<void> {
  await prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
    },
  });

  // 휴대폰 푸시 발송 — best-effort. 미구독 기기거나 VAPID 미설정이면 조용히 스킵.
  try {
    await sendPushToUser(input.userId, { title: input.title, body: input.body, link: input.link });
  } catch {
    /* best-effort */
  }
}

/**
 * 동일 알림을 여러 수신자에게 일괄 생성(새 모임 공지 → 멤버 전체 등).
 * userIds가 비어 있으면 아무 것도 하지 않는다. best-effort — 호출부에서 try/catch.
 */
export async function createNotifications(
  userIds: string[],
  payload: Omit<NotificationInput, "userId">,
): Promise<void> {
  if (userIds.length === 0) return;
  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: payload.type,
      title: payload.title,
      body: payload.body ?? null,
      link: payload.link ?? null,
    })),
  });

  try {
    await sendPushToUsers(userIds, { title: payload.title, body: payload.body, link: payload.link });
  } catch {
    /* best-effort */
  }
}

/**
 * 가입신청 승인/거절 시 해당 유저에게 인앱 알림 1건 생성.
 * /api/manage/membership(PATCH)·/api/admin/members/[id]/approve|reject 세 경로가 공유.
 * createNotification 위의 얇은 래퍼 — best-effort는 동일하게 호출부 책임.
 */
export async function createMembershipNotification(
  userId: string,
  action: "approve" | "reject",
  note?: string | null,
): Promise<void> {
  if (action === "approve") {
    await createNotification({
      userId,
      type: "membership_approved",
      title: "가입이 승인됐어요 🎉",
      body: FEATURES.archetype
        ? "환영해요! 먼저 성격유형을 골라 나에게 꼭 맞는 동아리를 찾아보세요."
        : "환영해요! 마음에 드는 동아리를 둘러보고 함께해요.",
      link: FEATURES.archetype ? "/start" : "/clubs",
    });
    return;
  }

  const reason = note?.trim();
  await createNotification({
    userId,
    type: "membership_rejected",
    title: "가입 신청 결과를 알려드려요",
    body: reason
      ? `아쉽지만 이번 신청은 다시 살펴보기로 했어요.\n사유: ${reason}\n언제든 다시 신청할 수 있어요.`
      : "아쉽지만 이번 신청은 다시 살펴보기로 했어요. 언제든 다시 신청할 수 있어요.",
    link: "/join",
  });
}

/**
 * 운영진 이상(staff|admin|superadmin) 전원의 유저 id — 운영자 알림 브로드캐스트 대상 조회용.
 * DB role 컬럼(staff/admin/superadmin) 뿐 아니라, SUPERADMIN_EMAILS 부트스트랩으로만
 * superadmin 권한을 갖고 DB role은 여전히 "member"인 계정(auth.users.email 매칭)도 포함한다 —
 * 그렇지 않으면 getAuthUser()가 런타임에 승격시키는 superadmin이 여기서는 누락된다.
 */
export async function getStaffUserIds(excludeUserId?: string): Promise<string[]> {
  const dbStaff = await prisma.user.findMany({
    where: { role: { in: ["staff", "admin", "superadmin"] }, deletedAt: null },
    select: { id: true },
  });

  const superadminEmails = getSuperadminEmails();
  const envSuperadmins = superadminEmails.length
    ? await prisma.$queryRaw<{ id: string }[]>`
        SELECT u.id FROM "User" u
        JOIN auth.users au ON au.id::text = u."supabaseId"
        WHERE LOWER(au.email) = ANY(${superadminEmails}) AND u."deletedAt" IS NULL
      `
    : [];

  const ids = new Set<string>([...dbStaff.map((u) => u.id), ...envSuperadmins.map((u) => u.id)]);
  if (excludeUserId) ids.delete(excludeUserId);
  return [...ids];
}

/**
 * 운영자 알림(admin_*) 브로드캐스트 — 현재 운영진+ 전원 조회 후 createNotifications 위임.
 * best-effort — 호출부에서 try/catch로 감싼다(운영 알림 실패가 본 작업을 막지 않음).
 */
export async function createAdminNotification(
  payload: Omit<NotificationInput, "userId"> & { type: Extract<NotificationType, `admin_${string}`> },
  excludeUserId?: string,
): Promise<void> {
  const staffIds = await getStaffUserIds(excludeUserId);
  await createNotifications(staffIds, payload);
}
