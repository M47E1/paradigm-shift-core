import type { Metadata } from "next";
import { ArrowUpRight, Code2, MessageSquareText } from "lucide-react";
import { siteConfig } from "@/config/site";

export const metadata: Metadata = {
  title: "Contact",
  description: "Public collaboration channels for Paradigm Shift Core.",
};

export default function ContactPage() {
  return (
    <div className="page">
      <header className="page-hero page-hero--blue">
        <p className="eyebrow">PUBLIC COLLABORATION</p>
        <h1>Contact</h1>
        <p>
          Keep support, feature proposals, and security reports in channels that
          leave a clear public or private record.
        </p>
      </header>

      <section className="contact-actions" aria-label="Collaboration channels">
        <a href={siteConfig.repository} target="_blank" rel="noreferrer">
          <Code2 aria-hidden="true" size={24} />
          <span>
            <strong>Repository</strong>
            Read the source and contribution guide.
          </span>
          <ArrowUpRight aria-hidden="true" size={18} />
        </a>
        <a
          href={`${siteConfig.repository}/issues`}
          target="_blank"
          rel="noreferrer"
        >
          <MessageSquareText aria-hidden="true" size={24} />
          <span>
            <strong>Issues</strong>
            Report a reproducible bug or propose a bounded change.
          </span>
          <ArrowUpRight aria-hidden="true" size={18} />
        </a>
      </section>
    </div>
  );
}
