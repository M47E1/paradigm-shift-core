export const siteConfig = {
  name: "Paradigm Shift Core",
  shortName: "PS Core",
  description:
    "An accessible personal operating system starter for projects, ideas, and working principles.",
  repository: "https://github.com/M47E1/paradigm-shift-core",
  nav: [
    { href: "/", label: "Home" },
    { href: "/projects", label: "Projects" },
    { href: "/thinking", label: "Thinking" },
    { href: "/about", label: "About" },
    { href: "/contact", label: "Contact" },
  ],
} as const;

const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

if (process.env.NODE_ENV === "production" && !configuredSiteUrl) {
  throw new Error("NEXT_PUBLIC_SITE_URL is required for production builds.");
}

export const siteUrl = configuredSiteUrl ?? "http://127.0.0.1:3000";
