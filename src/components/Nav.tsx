import { For, Show, createResource } from "solid-js";
import { useDisclosure } from "~/lib/useDisclosure";
import { jediApi } from "~/lib/jedi/jedi-api";
import { useAuth } from "~/components/AuthContext";
import Icon from "~/components/Icon";
import ThemeToggle from "~/components/ThemeToggle";

const NAV_LINKS = [
  { href: "/about", label: "About" },
  { href: "/readme", label: "Readme" },
  { href: "/fullstack", label: "FullStack" },
] as const;

export default function Nav() {
  let dropdownRef: HTMLDivElement | undefined;

  const { isAuthenticated, username, logoff } = useAuth();

  // The avatar image (and the logged-out display name) come from the Jedi mock
  // profile; `.latest` is a non-suspending read so the nav — which renders
  // outside the app's <Suspense> — never suspends the whole tree (see ADR-0007).
  // The display name is the login `username()` once authenticated, otherwise the
  // mock name; back-end integration (#17) unifies the two identities.
  const [profile] = createResource(() => jediApi.profile.get());
  const displayName = () => (isAuthenticated() ? username() : profile.latest?.name);

  // The profile dropdown is a popup — hidden (and inert) whenever closed, on
  // every viewport — dismissed by Escape or a click outside its wrapping <div>.
  const dropdown = useDisclosure({
    id: "profile-menu",
    mode: "popup",
    ref: () => dropdownRef,
  });
  const mobileNav = useDisclosure({ id: "site-mobile-nav" });

  return (
    <header class="site-header">
      <div class="flex items-center justify-between h-20 px-8">
        <a class="flex items-center gap-1" href="/">
          <Icon name="fire-heart" class="w-8 h-8 -mt-1" />
          <span class="text-lg font-bold">Awesome</span>
        </a>

        <div class="flex items-center gap-2">
          {/* Desktop links — inline; collapse into the mobile menu below */}
          <nav aria-label="Main" class="hidden md:block">
            <ul class="site-nav flex items-center">
              <For each={NAV_LINKS}>
                {(link) => (
                  <li>
                    <a class="nav-link" href={link.href}>
                      {link.label}
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </nav>

          {/* Profile dropdown — always visible */}
          <div ref={(el) => (dropdownRef = el)} class="relative">
            <button
              type="button"
              aria-label="Profile menu"
              {...dropdown.triggerProps}
              class="flex items-center gap-2 cursor-pointer select-none"
            >
              <img
                class="h-8 rounded-full object-cover bg-teal-200"
                src={profile.latest?.avatarUrl}
                alt={displayName() ? `${displayName()} avatar` : ""}
              />
              <span class="hidden sm:inline">{displayName()}</span>
              <Icon
                name="expand-arrow"
                class={`w-4 h-4 transition-transform duration-300 ${dropdown.open() ? "rotate-180" : ""}`}
              />
            </button>
            <div
              {...dropdown.panelProps}
              class={`absolute right-0 bg-(--theme-card-bg) text-(--theme-card-fg) shadow rounded-lg w-40 p-2 z-20 transition-[opacity,translate,scale] duration-300 ease-out origin-top ${dropdown.open() ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-90 -translate-y-5 pointer-events-none"}`}
            >
              <ul class="hoverlist">
                <li>
                  <button type="button" onClick={() => alert("Not implemented")}>
                    My Profile
                  </button>
                </li>
                <li>
                  <Show when={isAuthenticated()} fallback={<a href="/fullstack">Log In</a>}>
                    <button type="button" onClick={() => void logoff()}>
                      Log Out
                    </button>
                  </Show>
                </li>
              </ul>
            </div>
          </div>

          <ThemeToggle />

          {/* Mobile menu toggle */}
          <button
            type="button"
            aria-label="Toggle navigation"
            {...mobileNav.triggerProps}
            class="md:hidden h-12 w-12 flex items-center justify-center cursor-pointer hover:bg-gray-700 rounded-lg"
          >
            <Show
              when={mobileNav.open()}
              fallback={<Icon name="menu" class="w-6 h-6 select-none" />}
            >
              <Icon name="delete-sign" class="w-6 h-6 select-none" />
            </Show>
          </button>
        </div>
      </div>

      {/* Mobile menu — links only; avatar + theme stay in the top bar */}
      <nav
        {...mobileNav.panelProps}
        aria-label="Site menu"
        class={`md:hidden absolute inset-x-0 top-full bg-gray-800 transition-[opacity,translate] duration-300 ease-out ${mobileNav.open() ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"}`}
      >
        <ul class="site-nav flex flex-col items-center gap-4 py-6">
          <For each={NAV_LINKS}>
            {(link) => (
              <li>
                <a class="nav-link" href={link.href}>
                  {link.label}
                </a>
              </li>
            )}
          </For>
        </ul>
      </nav>
    </header>
  );
}
