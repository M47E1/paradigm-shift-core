import type { Metadata } from "next";
import { ProjectCard } from "@/components/ProjectCard";
import { projects } from "@/data/projects";

export const metadata: Metadata = {
  title: "Projects",
  description: "Neutral reference projects included with Paradigm Shift Core.",
};

export default function ProjectsPage() {
  return (
    <div className="page">
      <header className="page-hero page-hero--coral">
        <p className="eyebrow">REFERENCE IMPLEMENTATIONS</p>
        <h1>Projects</h1>
        <p>
          Three small patterns show how research, delivery, and spatial navigation
          can share one calm interface.
        </p>
      </header>

      <section className="page-section" aria-label="Project examples">
        <div className="project-grid project-grid--three">
          {projects.map((project) => (
            <ProjectCard key={project.slug} project={project} />
          ))}
        </div>
      </section>

      <section className="method-strip" aria-labelledby="project-method-title">
        <p className="eyebrow">SHARED METHOD</p>
        <h2 id="project-method-title">Define, build, verify, release.</h2>
        <ol>
          <li><span>01</span> Name the boundary</li>
          <li><span>02</span> Build the smallest useful artifact</li>
          <li><span>03</span> Verify behavior and evidence</li>
          <li><span>04</span> Release with a rollback path</li>
        </ol>
      </section>
    </div>
  );
}
