import "server-only";
import { normalizeSiteUrl } from "@/config/site-url.mjs";

const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
const isProduction = process.env.NODE_ENV === "production";

if (isProduction && !configuredSiteUrl) {
  throw new Error("NEXT_PUBLIC_SITE_URL is required for production builds.");
}

export const siteUrl = configuredSiteUrl
  ? normalizeSiteUrl(configuredSiteUrl, {
      production: isProduction,
      allowLoopback: process.env.PUBLIC_SITE_URL_ALLOW_LOOPBACK === "1",
    })
  : "http://127.0.0.1:3000";
