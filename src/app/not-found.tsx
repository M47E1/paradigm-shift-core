import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function NotFound() {
  return (
    <section className="not-found">
      <p className="eyebrow">404 / OUTSIDE THE INDEX</p>
      <h1>That route is not part of this system.</h1>
      <Link className="button button--primary" href="/">
        <ArrowLeft aria-hidden="true" size={17} />
        Return home
      </Link>
    </section>
  );
}
