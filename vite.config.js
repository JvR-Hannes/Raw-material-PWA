import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["icons/icon-192.png", "icons/icon-512.png"],
            manifest: {
                name: "Raw Material Stock Count",
                short_name: "Stock Count",
                description: "Offline-first raw material stock count and valuation app.",
                theme_color: "#0f172a",
                background_color: "#f8fafc",
                display: "standalone",
                start_url: "/",
                scope: "/",
                icons: [
                    {
                        src: "/icons/icon-192.png",
                        sizes: "192x192",
                        type: "image/png"
                    },
                    {
                        src: "/icons/icon-512.png",
                        sizes: "512x512",
                        type: "image/png"
                    }
                ]
            },
            workbox: {
                globPatterns: ["**/*.{js,css,html,png,svg,ico}"],
                cleanupOutdatedCaches: true,
                runtimeCaching: [
                    {
                        urlPattern: function (_a) {
                            var request = _a.request;
                            return request.destination === "document";
                        },
                        handler: "NetworkFirst",
                        options: {
                            cacheName: "documents"
                        }
                    },
                    {
                        urlPattern: function (_a) {
                            var request = _a.request;
                            return ["script", "style", "image"].includes(request.destination);
                        },
                        handler: "StaleWhileRevalidate",
                        options: {
                            cacheName: "assets"
                        }
                    }
                ]
            }
        })
    ]
});
