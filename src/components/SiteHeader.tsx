import Link from "next/link";
import { ArrowUpRight, Code2, Menu } from "lucide-react";
import { siteConfig } from "@/config/site";

function PrimaryLinks({ className }: { className: string }) {
  return (
    <nav className={className} aria-label="Primary navigation">
      {siteConfig.nav.map((item) => (
        <Link key={item.href} href={item.href}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="site-header__inner">
        <Link className="brand-lockup" href="/" aria-label="Paradigm Shift Core home">
          <span className="brand-mark" aria-hidden="true">
            PS
          </span>
          <span>{siteConfig.shortName}</span>
        </Link>

        <PrimaryLinks className="desktop-nav" />

        <a
          className="icon-link desktop-repository-link"
          href={siteConfig.repository}
          target="_blank"
          rel="noreferrer"
          aria-label="Open the GitHub repository"
          title="GitHub repository"
        >
          <Code2 aria-hidden="true" size={18} />
          <ArrowUpRight aria-hidden="true" size={14} />
        </a>

        <details className="mobile-nav">
          <summary aria-label="Open navigation">
            <Menu aria-hidden="true" size={20} />
          </summary>
          <PrimaryLinks className="mobile-nav__panel" />
        </details>
      </div>
    </header>
  );
}
