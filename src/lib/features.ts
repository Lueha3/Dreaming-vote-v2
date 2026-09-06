/**
 * 기능 노출 플래그 — v2에서 감춘 기능. 코드는 남기고(삭제가 아니다) 진입점만 막는다.
 * 미들웨어(edge)·서버 컴포넌트·클라이언트 컴포넌트가 모두 import하므로 순수 상수만 둔다.
 *
 * 다시 켜려면 값만 true로 바꾸면 된다. 각 플래그가 가리는 곳:
 *  - plaza:     /prayer 페이지·/api/prayers, 관리 '이번 주 질문', 하단 탭·헤더 메뉴, 홈의 '광장 소식'·주간 질문 카드,
 *               온보딩 '첫 글 남기기', 생일/환영 카드 자동 게시, 프로필 활동 요약의 글 수
 *  - archetype: /start·/report 페이지·성향 관련 API, 헤더 메뉴, 승인 직후 /start 리다이렉트,
 *               내정보 '성향 카드' 탭, 홈 환영 카드의 성격유형 CTA, 온보딩 '성격유형 고르기',
 *               라인업 보드 인물형 메달, 멤버 카드·프로필 피크의 성향 문구
 */
export const FEATURES = {
  plaza: false,
  archetype: false,
} as const;

/**
 * 감춘 기능의 경로 — 미들웨어가 페이지 요청은 홈으로, API 요청은 404로 돌린다.
 * 파일을 지우지 않고도 URL로 직접 들어오는 길까지 막는 단일 지점.
 */
export const HIDDEN_PATH_PREFIXES: readonly string[] = [
  ...(FEATURES.plaza ? [] : ["/prayer", "/api/prayers", "/manage/icebreaker", "/api/manage/icebreaker"]),
  ...(FEATURES.archetype
    ? []
    : ["/start", "/report", "/api/my/start-seen", "/api/clubs/recommend", "/api/reports/personality"]),
];

/** 정확히 그 경로이거나 그 아래 경로일 때만 — "/report"가 "/reports"를 잡지 않도록 구분자를 본다. */
export function isHiddenPath(pathname: string): boolean {
  return HIDDEN_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
