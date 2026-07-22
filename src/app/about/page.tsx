import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";

export const metadata: Metadata = {
  title: "About",
  description: "The architecture and publishing boundary behind Paradigm Shift Core.",
};

const boundaries = [
  "Neutral sample content instead of personal dossiers",
  "Code-generated visuals instead of copied media",
  "DOM navigation beside every WebGL experience",
  "Reduced-motion and mobile fallbacks by default",
  "No crawlers, account sessions, or production credentials",
];

export default function AboutPage() {
  return (
    <div className="page">
      <header className="page-hero page-hero--gold">
        <p className="eyebrow">ABOUT THE CORE</p>
        <h1>A public system with a private boundary.</h1>
        <p>
          Paradigm Shift Core separates reusable interface code from the personal,
          commercial, and operational material that belongs in a private layer.
        </p>
      </header>

      <section className="about-layout">
        <div className="about-layout__statement">
          <p className="eyebrow">DESIGN POSITION</p>
          <h2>Visual depth should never become an access requirement.</h2>
          <p>
            The Three.js field is decorative and optional. Semantic links carry
            navigation, ordinary HTML carries content, and reduced motion removes
            the canvas entirely.
          </p>
        </div>
        <ul className="boundary-list">
          {boundaries.map((boundary) => (
            <li key={boundary}>
              <CheckCircle2 aria-hidden="true" size={19} />
              {boundary}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
