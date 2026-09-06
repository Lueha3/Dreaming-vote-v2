import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "동아리드림",
    short_name: "동아리드림",
    description: "내 성향에 맞는 동아리를 찾아주는 꿈꾸는교회 청년부 동아리 플랫폼",
    start_url: "/",
    display: "standalone",
    background_color: "#E9F5FC",
    theme_color: "#7FBDE4",
    icons: [
      { src: "/manifest-icon/192", sizes: "192x192", type: "image/png" },
      { src: "/manifest-icon/512", sizes: "512x512", type: "image/png" },
    ],
  };
}
