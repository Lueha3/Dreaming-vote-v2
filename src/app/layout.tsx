import type { Metadata, Viewport } from "next";
import "./globals.css";

import { Header } from "@/components/Header";
import { SkyBackdrop } from "@/components/SkyBackdrop";
import { AutoPushPrompt } from "@/components/AutoPushPrompt";
import { BottomTabBar } from "@/components/BottomTabBar";
import { SessionTimeoutGuard } from "@/components/SessionTimeoutGuard";
import { ProfilePeekProvider } from "@/components/ProfilePeek";
import { SplashIntro } from "@/components/SplashIntro";
import { STARTUP_IMAGES, startupImageMedia, startupImageUrl } from "@/lib/startupImages";

export const metadata: Metadata = {
  title: "동아리드림 — 꿈꾸는교회 청년부",
  description:
    "동아리, 모임, 새 소식까지. 우리 청년부 이야기가 여기 모여요.",
  openGraph: {
    title: "오늘의, 청년부 — 동아리드림",
    description: "동아리, 모임, 새 소식까지. 우리 청년부 이야기가 여기 모여요.",
    siteName: "동아리드림",
  },
  // iOS "홈 화면에 추가" 시 아이콘 아래 표시되는 이름 — 미설정 시 <title>이 길게 잘려 노출됨.
  appleWebApp: {
    capable: true,
    title: "동아리드림",
    statusBarStyle: "default",
    // 런치 이미지 — 없으면 앱을 켤 때 OS가 흰 화면을 띄운 채 로딩을 기다린다.
    // 기기별 미디어쿼리가 정확히 맞아야 iOS가 사용한다(startupImages.ts 참고).
    startupImage: STARTUP_IMAGES.map((s) => ({
      url: startupImageUrl(s),
      media: startupImageMedia(s),
    })),
  },
};

// 하단 고정 CTA가 iOS 홈 인디케이터 영역까지 safe-area 인셋을 확보하려면 필요.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#7FBDE4",
};

const SUPABASE_ORIGIN = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
      : null;
  } catch {
    return null;
  }
})();

const FONT_CSS =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";

/**
 * 앱 실행 스플래시 노출 판정 — 첫 페인트 '전에' 끝내야 하므로 <head> 인라인 스크립트로 돈다.
 * (useEffect로 판정하면 하이드레이션 이후라 콘텐츠가 먼저 보였다가 스플래시가 덮는 역전이 생긴다.)
 *
 * 조건: 홈 화면에 추가한 앱(standalone) + 이번 실행의 첫 진입.
 *  - standalone 판정은 lib/displayMode.ts와 같은 규칙(display-mode + iOS navigator.standalone).
 *    여긴 번들 밖 인라인이라 import를 못 해 불가피하게 같은 식을 한 번 더 쓴다.
 *  - sessionStorage는 홈 화면 아이콘으로 켤 때마다 비므로 정확히 '앱 콜드스타트'를 뜻한다.
 *    앱 안에서 페이지를 옮기거나 새로고침할 때는 유지되어 다시 뜨지 않는다.
 *    (localStorage를 쓰면 평생 1회만 떠서 의도와 다르다.)
 *  - /admin은 다크 테마 별세계라 하늘색 스플래시가 이질적이므로 제외.
 *  - ?splash=1 은 일반 브라우저에서 확인해보기 위한 강제 노출 스위치.
 * 프라이빗 모드 등 sessionStorage 접근 실패 시엔 조용히 스플래시를 생략한다(화면이 막히면 안 됨).
 */
const SPLASH_GATE = `(function(){try{
var q=location.search.indexOf('splash=1')>=0;
if(!q){
if(location.pathname.indexOf('/admin')===0)return;
if(!(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true))return;
if(sessionStorage.getItem('bh-splash-shown'))return;
sessionStorage.setItem('bh-splash-shown','1');
}
var d=document.documentElement;
d.classList.add('splash-on');
var started=false;
function go(){if(started)return;started=true;d.classList.add('splash-go');}
function whenPainted(){requestAnimationFrame(function(){requestAnimationFrame(go);});}
if(document.visibilityState==='hidden'){
document.addEventListener('visibilitychange',function h(){
if(document.visibilityState!=='hidden'){document.removeEventListener('visibilitychange',h);whenPainted();}});
setTimeout(go,4000);
}else{whenPainted();}
}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <head>
        {/* 폰트 CDN 커넥션을 첫 페인트 이전에 미리 연다 (핸드셰이크를 크리티컬 패스에서 제거).
            crossOrigin 필수 — 폰트 CSS는 익명 CORS 요청이라 없으면 커넥션이 재사용되지 않음. */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
        {/* 클라이언트 인증(로그인/세션) 호출 대상 Supabase origin도 미리 연결 */}
        {SUPABASE_ORIGIN && (
          <>
            <link rel="preconnect" href={SUPABASE_ORIGIN} crossOrigin="anonymous" />
            <link rel="dns-prefetch" href={SUPABASE_ORIGIN} />
          </>
        )}
        {/* 폰트 CSS를 첫 페인트 비차단으로 로드: print 미디어로 받아 렌더를 막지 않고,
            로드 완료 후 인라인 스크립트로 all 승격(시스템 폰트 → Pretendard swap).
            preload로 페치를 일찍 시작하고, 무JS 환경은 noscript 폴백으로 보장. */}
        <link rel="preload" as="style" href={FONT_CSS} crossOrigin="anonymous" />
        <link
          id="pretendard-css"
          rel="stylesheet"
          href={FONT_CSS}
          media="print"
          crossOrigin="anonymous"
          suppressHydrationWarning
        />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){var l=document.getElementById('pretendard-css');if(!l)return;if(l.sheet){l.media='all';}else{l.addEventListener('load',function(){l.media='all';});}})();",
          }}
        />
        <noscript>
          {/* eslint-disable-next-line @next/next/no-css-tags */}
          <link rel="stylesheet" href={FONT_CSS} crossOrigin="anonymous" />
        </noscript>
        {/* 스플래시 노출 판정 — 반드시 body 페인트 전에 실행되어야 한다(위 상수 주석 참고) */}
        <script dangerouslySetInnerHTML={{ __html: SPLASH_GATE }} />
      </head>
      <body className="antialiased">
        {/* 앱 실행 스플래시 — 전역 오버레이라 Provider 밖 body 첫 자식으로 둔다 */}
        <SplashIntro />
        <SkyBackdrop />
        {/* 자동 로그아웃 타이머 — 렌더 결과가 없는 상주 컴포넌트라 위치는 무관하다 */}
        <SessionTimeoutGuard />
        <ProfilePeekProvider>
          <Header />
          {children}
          <AutoPushPrompt />
          <BottomTabBar />
        </ProfilePeekProvider>
      </body>
    </html>
  );
}
