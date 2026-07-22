import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { siteConfig } from "@/config/site";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div>
          <p className="eyebrow">OPEN SOURCE STARTER</p>
          <p className="site-footer__brand">{siteConfig.name}</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/projects">Projects</Link>
          <Link href="/about">About</Link>
          <a href={siteConfig.repository} target="_blank" rel="noreferrer">
            GitHub <ArrowUpRight aria-hidden="true" size={14} />
          </a>
        </nav>
        <p className="site-footer__license">Code released under the MIT License.</p>
      </div>
    </footer>
  );
}
