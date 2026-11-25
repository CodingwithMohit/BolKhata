import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BolKhata",
    short_name: "BolKhata",
    description: "A simple digital udhaar ledger for neighborhood shops.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf9f4",
    theme_color: "#1f6840",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
