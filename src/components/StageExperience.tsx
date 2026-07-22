"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { siteConfig } from "@/config/site";

const OrbitalStage = dynamic(() => import("@/components/OrbitalStage"), {
  ssr: false,
});

const stageLinks = siteConfig.nav.filter((item) => item.href !== "/");
function supportsWebGL() {
  try {
    const probe = document.createElement("canvas");
    return Boolean(probe.getContext("webgl2"));
  } catch {
    return false;
  }
}


export function StageExperience() {
  const [mode, setMode] = useState<"pending" | "canvas" | "fallback">("pending");

  useEffect(() => {
    const webglAvailable = supportsWebGL();
    const mobileQuery = window.matchMedia("(max-width: 767px)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncMode = () => {
      setMode(mobileQuery.matches || motionQuery.matches || !webglAvailable ? "fallback" : "canvas");
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
        {mode === "canvas" ? <OrbitalStage /> : <div className="stage-static-field" data-testid="stage-fallback" />}
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
