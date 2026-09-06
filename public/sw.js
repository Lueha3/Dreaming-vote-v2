// 휴대폰 푸시 알림 서비스 워커. lib/push.ts가 보내는 JSON payload({title, body, link})를
// 수신해 OS 알림으로 표시하고, 클릭 시 해당 링크의 탭을 포커스(없으면 새로 열기)한다.
self.addEventListener("push", (event) => {
  let data = { title: "동아리드림", body: "", link: "/" };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* JSON 파싱 실패 시 기본값 사용 */
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || undefined,
      icon: "/manifest-icon/192",
      badge: "/manifest-icon/192",
      data: { link: data.link || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";

  event.waitUntil(
    (async () => {
      const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientsList) {
        const url = new URL(client.url);
        if (url.origin === self.location.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(link);
          return;
        }
      }
      await self.clients.openWindow(link);
    })(),
  );
});
