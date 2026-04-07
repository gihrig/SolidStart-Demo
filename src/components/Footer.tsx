import { A } from "@solidjs/router";
import { useLocation } from "@solidjs/router";

export default function Footer() {
  const location = useLocation();
  const active = (path: string) =>
    path == location.pathname ? "border-sky-600" : "border-transparent hover:border-sky-600";
  return (
    <footer role="contentinfo" aria-label="Site footer">
      <p class="mt-8 text-center!">
        Visit{" "}
        <a href="https://solidjs.com" target="_blank" class="text-(--theme-accent) hover:underline">
          solidjs.com
        </a>{" "}
        to learn how to build Solid apps.
      </p>
      <p class="my-4 text-center!">
        <A href="/" class={`border-b-2 ${active("/")} text-(--theme-accent) hover:underline`}>
          Home
        </A>{" "}
        {" - "}
        <A
          href="/about"
          class={`border-b-2 ${active("/about")} text-(--theme-accent) hover:underline`}
        >
          About
        </A>{" "}
        {" - "}
        <A
          href="/readme"
          class={`border-b-2 ${active("/readme")} text-(--theme-accent) hover:underline`}
        >
          ReadMe
        </A>{" "}
      </p>
    </footer>
  );
}
