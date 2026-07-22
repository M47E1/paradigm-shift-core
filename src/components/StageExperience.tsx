"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Component, type ReactNode, useEffect, useState } from "react";
import { siteConfig } from "@/config/site";

function StageFallback() {
  return <div className="stage-static-field" data-testid="stage-fallback" />;
}

const OrbitalStage = dynamic(() => import("@/components/OrbitalStage"), {
  ssr: false,
  loading: StageFallback,
});

const stageLinks = siteConfig.nav.filter((item) => item.href !== "/");

function supportsWebGL() {
  try {
    const probe = document.createElement("canvas");
    const context = probe.getContext("webgl2");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

class StageErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <StageFallback /> : this.props.children;
  }
}

export function StageExperience() {
  const [mode, setMode] = useState<"pending" | "canvas" | "fallback">("pending");

  useEffect(() => {
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncMode = () => {
      if (mobileQuery.matches || motionQuery.matches) {
        setMode("fallback");
        return;
      }
      setMode(supportsWebGL() ? "canvas" : "fallback");
    };

    syncMode();
    mobileQuery.addEventListener("change", syncMode);
    motionQuery.addEventListener("change", syncMode);
    return () => {
      mobileQuery.removeEventListener("change", syncMode);
      motionQuery.removeEventListener("change", syncMode);
    };
  }, []);

  return (
    <div className="stage-experience">
      <div className="stage-experience__visual" aria-hidden="true">
        {mode === "canvas" ? (
          <StageErrorBoundary>
            <OrbitalStage />
          </StageErrorBoundary>
        ) : (
          <StageFallback />
        )}
      </div>

      <nav className="stage-index" aria-label="Explore the site">
        <p className="stage-index__label">SYSTEM INDEX</p>
        <ol>
          {stageLinks.map((item, index) => (
            <li key={item.href}>
              <Link href={item.href}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{item.label}</strong>
              </Link>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
