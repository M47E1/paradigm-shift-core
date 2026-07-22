import type { Project } from "@/data/projects";

function ProjectVisual({ variant }: { variant: Project["visual"] }) {
  return (
    <div className={`project-visual project-visual--${variant}`} aria-hidden="true">
      <span className="project-visual__axis project-visual__axis--x" />
      <span className="project-visual__axis project-visual__axis--y" />
      <span className="project-visual__node project-visual__node--one" />
      <span className="project-visual__node project-visual__node--two" />
      <span className="project-visual__node project-visual__node--three" />
    </div>
  );
}

type ProjectCardProps = {
  project: Project;
  headingLevel?: "h2" | "h3";
};

export function ProjectCard({ project, headingLevel = "h2" }: ProjectCardProps) {
  const Heading = headingLevel;
  return (
    <article className="project-card">
      <ProjectVisual variant={project.visual} />
      <div className="project-card__body">
        <div className="project-card__meta">
          <span>{project.index}</span>
          <span>{project.kind}</span>
        </div>
        <Heading className="project-card__title">{project.title}</Heading>
        <p>{project.summary}</p>
        <p className="project-card__outcome">{project.outcome}</p>
        <ul className="tag-list" aria-label={`${project.title} technologies`}>
          {project.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      </div>
    </article>
  );
}
