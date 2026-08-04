import type { SafeUrl } from "~/lib/sanitizeUrl";

export interface HeroProps {
  title: string;
  subtitle: string;
  ctaText: string;
  ctaHref: SafeUrl;
  backgroundImage: SafeUrl;
}

export default function Hero(props: HeroProps) {
  const bgImage = () => {
    const url = props.backgroundImage;
    return url ? `url('${url}')` : undefined;
  };

  return (
    <section
      aria-label="Hero"
      class="grid bg-gray-700 text-white text-center bg-cover relative"
      style={{ "background-image": bgImage() }}
    >
      <div class="col-start-1 row-start-1 bg-gray-800/40 w-full h-full" />
      <div class="col-start-1 row-start-1 py-24 px-10">
        <h1 class="text-7xl leading-tight mb-4 animate-fade-in font-hero">{props.title}</h1>
        <p class="text-lg font-bold mb-5">{props.subtitle}</p>
        <a
          class="inline-flex flex-wrap shrink-0 items-center justify-center px-4 min-h-13 font-semibold rounded-lg text-white transition-transform active:scale-95 bg-(--theme-btn-primary) hover:bg-(--theme-btn-primary-hover) shadow-md"
          href={props.ctaHref}
        >
          {props.ctaText}
        </a>
      </div>
    </section>
  );
}
