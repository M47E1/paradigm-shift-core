import Link from "next/link";
import { ArrowRight, ArrowUpRight, Code2 } from "lucide-react";
import { ProjectCard } from "@/components/ProjectCard";
import { StageExperience } from "@/components/StageExperience";
import { siteConfig } from "@/config/site";
import { principles } from "@/data/principles";
import { projects } from "@/data/projects";

export default function HomePage() {
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <StageExperience />
        <div className="hero__copy">
          <p className="eyebrow">OPEN SOURCE / PUBLIC OS</p>
          <h1 id="hero-title">Paradigm Shift Core</h1>
          <p className="hero__lede">
            A privacy-safe foundation for publishing projects, working principles,
            and ideas without making a visual interface the only way in.
          </p>
          <div className="hero__actions">
            <Link className="button button--primary" href="/projects">
              Explore projects <ArrowRight aria-hidden="true" size={17} />
            </Link>
            <a
              className="button button--quiet"
              href={siteConfig.repository}
              target="_blank"
              rel="noreferrer"
            >
              <Code2 aria-hidden="true" size={17} />
              View source
              <ArrowUpRight aria-hidden="true" size={15} />
            </a>
          </div>
        </div>
        <p className="hero__status">NEXT.JS / REACT / THREE.JS</p>
      </section>

      <section className="content-band content-band--light" aria-labelledby="principles-title">
        <div className="section-heading">
          <p className="eyebrow">OPERATING LAYERS</p>
          <h2 id="principles-title">Build the interface and its evidence together.</h2>
        </div>
        <div className="principle-grid">
          {principles.map((principle) => (
            <article key={principle.index} className="principle">
              <p>{principle.index}</p>
              <h3>{principle.title}</h3>
              <span>{principle.body}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="content-band content-band--ink" aria-labelledby="projects-title">
        <div className="section-heading section-heading--row">
          <div>
            <p className="eyebrow">REFERENCE BUILDS</p>
            <h2 id="projects-title">Reusable patterns, not private case files.</h2>
          </div>
          <Link className="text-link" href="/projects">
            All projects <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </div>
        <div className="project-grid">
          {projects.slice(0, 2).map((project) => (
            <ProjectCard key={project.slug} project={project} headingLevel="h3" />
          ))}
        </div>
      </section>

      <section className="closing-band" aria-labelledby="closing-title">
        <p className="eyebrow">MAKE IT YOURS</p>
        <h2 id="closing-title">Keep the system. Replace the story.</h2>
        <p>
          The repository contains neutral fixtures and code-generated visuals, so
          personal data and licensed production media stay outside the public core.
        </p>
        <Link className="button button--primary" href="/about">
          Read the approach <ArrowRight aria-hidden="true" size={17} />
        </Link>
      </section>
    </>
  );
}
