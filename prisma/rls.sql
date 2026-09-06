-- ============================================================================
-- Row Level Security (RLS) hardening — 동아리드림
-- ============================================================================
-- 이 앱은 모든 DB 접근을 서버 사이드 Prisma(`postgres` = 테이블 소유자 연결)로만
-- 수행합니다. 테이블 소유자는 RLS를 우회하므로 아래 설정은 Prisma 동작에 영향이
-- 없습니다.
--
-- 반면 공개된 anon 키(NEXT_PUBLIC_SUPABASE_ANON_KEY)로 접근하는 Supabase
-- PostgREST(anon / authenticated 롤)는 테이블 소유자가 아니므로 RLS가 강제됩니다.
-- 정책(policy)을 하나도 만들지 않으면 = "전부 거부" → anon 키로 이 테이블들을
-- 직접 읽거나 쓸 수 없습니다 (심층 방어).
--
-- 적용:  Supabase MCP `apply_migration` (또는 SQL editor)로 실행.
--        모든 문장은 idempotent — 여러 번 실행해도 안전합니다.
-- 주의:  이 파일은 프로덕션 DB를 변경합니다. 적용 전 사용자 승인 필요.
-- ============================================================================

ALTER TABLE "User"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Report"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PromptVersion"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ParsingLog"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ShareEvent"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Club"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClubApplication"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClubRecommendation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification"       ENABLE ROW LEVEL SECURITY;  -- 개인 알림(본인 외 접근 차단). create_notification_table 마이그레이션에서 이미 적용됨.
ALTER TABLE "AuditLog"           ENABLE ROW LEVEL SECURITY;  -- 감사 로그(운영 전용). create_audit_log_table 마이그레이션에서 이미 적용됨.
ALTER TABLE "ContentReport"      ENABLE ROW LEVEL SECURITY;  -- 사용자 신고(운영 전용). create_content_report_table 마이그레이션에서 이미 적용됨.
ALTER TABLE "ClubMeetingRsvp"    ENABLE ROW LEVEL SECURITY;  -- 모임 참석 표시. create_meeting_rsvp_and_reminder 마이그레이션에서 이미 적용됨.
ALTER TABLE "Announcement"       ENABLE ROW LEVEL SECURITY;  -- 공지사항. enable_rls_announcement_prayercomment_images_review 마이그레이션에서 적용됨.
ALTER TABLE "ClubMeetingReview"  ENABLE ROW LEVEL SECURITY;  -- 모임 후기. 〃
ALTER TABLE "ClubMeetingImage"   ENABLE ROW LEVEL SECURITY;  -- 모임 갤러리 사진(URL만 저장, 업로드 자체는 Storage). 〃
ALTER TABLE "PrayerImage"        ENABLE ROW LEVEL SECURITY;  -- 광장 글 첨부 이미지(URL만 저장). 〃
ALTER TABLE "PrayerComment"      ENABLE ROW LEVEL SECURITY;  -- 광장 댓글/대댓글. 〃
ALTER TABLE "PushSubscription"   ENABLE ROW LEVEL SECURITY;  -- 휴대폰 푸시 구독(기기별 키). create_push_subscription_table 마이그레이션에서 이미 적용됨.
ALTER TABLE "MetricSnapshot"     ENABLE ROW LEVEL SECURITY;  -- 주간 운영 지표 스냅샷(운영 전용). add_metric_snapshot_and_prayer_system_type 마이그레이션에서 이미 적용됨.
ALTER TABLE "BuddyMatch"         ENABLE ROW LEVEL SECURITY;  -- 짝꿍 매칭(요청/수락 1:1). redesign_buddy_match_request_accept 마이그레이션에서 재생성·적용됨.
ALTER TABLE "IcebreakerPrompt"   ENABLE ROW LEVEL SECURITY;  -- 주간 아이스브레이커 질문. add_birthday_club_system_flag_icebreaker_prompt 마이그레이션에서 이미 적용됨.
ALTER TABLE "MonthlyRecap"       ENABLE ROW LEVEL SECURITY;  -- 월간 리캡 스냅샷(운영 조회 전용). add_monthly_recap_table 마이그레이션에서 이미 적용됨.
ALTER TABLE "SupportTicket"      ENABLE ROW LEVEL SECURITY;  -- 고객센터 문의(익명·비밀글 가능). add_support_center_tables 마이그레이션에서 이미 적용됨.
ALTER TABLE "SupportReply"       ENABLE ROW LEVEL SECURITY;  -- 고객센터 운영진 답글. 〃
ALTER TABLE "PrayerCommentLike"  ENABLE ROW LEVEL SECURITY;  -- 광장 댓글 좋아요. add_prayer_comment_like 마이그레이션에서 적용됨.

-- 정책은 의도적으로 생성하지 않습니다.
-- (anon/authenticated 직접 접근 전면 차단; 서비스는 Prisma 소유자 연결로만 동작)

-- ----------------------------------------------------------------------------
-- ClubImage / Prayer / PrayerIntercession은 RLS는 켜져 있었지만 과거에 만들어진
-- public(anon 포함) 전면 허용 정책(qual: true)이 남아있어 실질적으로 무방비
-- 상태였다. 앱 코드는 이 테이블들을 클라이언트에서 직접 호출하지 않으므로
-- (Storage 버킷 업로드만 클라이언트에서 직접 수행, row는 Prisma API로 생성)
-- 정책을 제거해 다른 테이블과 동일한 기본 거부 상태로 되돌린다.
-- drop_open_public_policies_clubimage_prayer_intercession 마이그레이션에서 적용됨.
DROP POLICY IF EXISTS "ClubImage_read" ON "ClubImage";
DROP POLICY IF EXISTS "ClubImage_write" ON "ClubImage";
DROP POLICY IF EXISTS "Prayer_all" ON "Prayer";
DROP POLICY IF EXISTS "PrayerIntercession_all" ON "PrayerIntercession";

-- ----------------------------------------------------------------------------
-- Storage 버킷 listing 허용 SELECT 정책 제거 (storage.objects).
-- 공개 버킷은 URL을 알면 개별 객체에 접근할 수 있지만(CDN 레벨),
-- SELECT 정책이 있으면 anon이 버킷 전체 목록(list)까지 조회 가능하다.
-- 앱 코드는 supabase.storage.from(bucket).list()를 호출하지 않으므로
-- 정책을 제거해도 기능에 영향 없음. INSERT / DELETE 정책은 유지.
-- drop_broad_select_policies_storage_buckets 마이그레이션에서 적용됨.
DROP POLICY IF EXISTS "avatars_select"      ON storage.objects;
DROP POLICY IF EXISTS "club_images_select"  ON storage.objects;
DROP POLICY IF EXISTS "plaza_images_select" ON storage.objects;

-- ----------------------------------------------------------------------------
-- ⚠️ 위 SELECT 전면 제거가 업로드 자체를 깨뜨렸다(2026-07-02 발견).
-- Supabase Storage는 업로드(INSERT) 시 내부적으로 INSERT ... RETURNING *을
-- 실행해 결과를 클라이언트에 돌려주는데, 이 RETURNING은 SELECT RLS가 있어야
-- 통과한다. SELECT 정책이 아예 없으면 업로드 자체가
-- "new row violates row-level security policy"로 실패한다
-- (avatars 프로필 사진 업로드에서 실측 재현·확인됨; club-images/plaza-images도
-- 동일 구조라 SQL 시뮬레이션으로 동일 실패 확인).
-- anon의 버킷 전체 목록 조회를 막으려던 원래 의도는 유지하면서, 본인이
-- 소유한 객체만 보이는 owner 범위 SELECT 정책으로 복원한다(anon 미포함).
-- restore_owner_scoped_select_policies_storage_buckets 마이그레이션에서 적용됨.
CREATE POLICY "avatars_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND owner = auth.uid());

CREATE POLICY "club_images_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'club-images' AND owner = auth.uid());

CREATE POLICY "plaza_images_select_own" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'plaza-images' AND owner = auth.uid());
