export type Project = {
  slug: string;
  index: string;
  title: string;
  kind: string;
  summary: string;
  outcome: string;
  tags: readonly string[];
  visual: "signal" | "grid" | "orbit";
};

export const projects: readonly Project[] = [
  {
    slug: "evidence-map",
    index: "01",
    title: "Evidence Map",
    kind: "Research system",
    summary:
      "A reference pattern for turning scattered source material into a traceable decision surface.",
    outcome: "Sources, claims, and confidence remain visible together.",
    tags: ["Research", "Provenance", "Decisions"],
    visual: "signal",
  },
  {
    slug: "workflow-console",
    index: "02",
    title: "Workflow Console",
    kind: "Delivery system",
    summary:
      "A compact interface for moving work from definition through implementation and verification.",
    outcome: "Each release has a clear owner, check, and rollback path.",
    tags: ["Workflow", "Verification", "Delivery"],
    visual: "grid",
  },
  {
    slug: "orbital-index",
    index: "03",
    title: "Orbital Index",
    kind: "Spatial interface",
    summary:
      "An accessible navigation model that pairs a generative Three.js field with ordinary DOM links.",
    outcome: "The visual layer enriches navigation without becoming its only interface.",
    tags: ["Three.js", "Accessibility", "Navigation"],
    visual: "orbit",
  },
] as const;
