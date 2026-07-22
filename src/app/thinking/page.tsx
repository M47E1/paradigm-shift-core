import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Thinking",
  description: "A neutral thinking index for notes, models, and open questions.",
};

const frames = [
  {
    index: "01",
    label: "SYSTEMS",
    title: "What keeps this system stable?",
    body: "Look for feedback, constraints, delayed effects, and the conditions that would change the state.",
  },
  {
    index: "02",
    label: "DECISIONS",
    title: "What evidence would change the choice?",
    body: "Separate preference from proof and make disconfirming evidence easy to name.",
  },
  {
    index: "03",
    label: "INTERFACES",
    title: "Which action deserves the clearest path?",
    body: "Design around repeated work, not the most impressive screenshot.",
  },
  {
    index: "04",
    label: "LEARNING",
    title: "What became reusable after the attempt?",
    body: "Keep the model, test, and failure condition close enough for the next person to apply.",
  },
];

export default function ThinkingPage() {
  return (
    <div className="page">
      <header className="page-hero page-hero--teal">
        <p className="eyebrow">NOTES / MODELS / QUESTIONS</p>
        <h1>Thinking</h1>
        <p>
          A small index of prompts for making assumptions visible before they
          harden into product decisions.
        </p>
      </header>

      <section className="thinking-index" aria-label="Thinking frames">
        {frames.map((frame) => (
          <article key={frame.index} className="thinking-row">
            <p>{frame.index}</p>
            <div>
              <span>{frame.label}</span>
              <h2>{frame.title}</h2>
            </div>
            <p>{frame.body}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
