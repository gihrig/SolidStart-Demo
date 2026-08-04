import { Show } from "solid-js";
import { useDisclosure } from "~/lib/useDisclosure";
import type { AuthorRef } from "~/types/jedi";
import Icon from "~/components/Icon";

export interface JediNavProps {
  profile?: AuthorRef;
}

export default function JediNav(props: JediNavProps) {
  let dropdownRef: HTMLLIElement | undefined;

  // The profile dropdown is a popup — hidden (and inert) whenever closed, on
  // every viewport — dismissed by Escape or a click outside its wrapping <li>.
  const dropdown = useDisclosure({
    id: "jedi-profile-menu",
    mode: "popup",
    ref: () => dropdownRef,
  });
  // The mobile menu stays open while its own profile dropdown is open, so the
  // dropdown absorbs the first Escape / click-away.
  const mobileNav = useDisclosure({
    id: "jedi-mobile-nav",
    dismissWhen: () => !dropdown.open(),
  });

  return (
    <header class="jedi-header">
      <div class="flex items-center justify-between h-20 px-8">
        <a class="flex items-center gap-1" href="/jedi">
          <Icon name="fire-heart" class="w-8 h-8 -mt-1" />
          <span class="text-lg font-bold">Awesome</span>
        </a>
        <button
          type="button"
          aria-label="Toggle navigation"
          {...mobileNav.triggerProps}
          class="md:hidden h-12 w-12 flex items-center justify-center cursor-pointer hover:bg-gray-700 rounded-lg"
        >
          <Show when={mobileNav.open()} fallback={<Icon name="menu" class="w-6 h-6 select-none" />}>
            <Icon name="delete-sign" class="w-6 h-6 select-none" />
          </Show>
        </button>
      </div>
      <nav
        {...mobileNav.panelProps}
        aria-label="Jedi site navigation"
        class={`bg-gray-800 h-screen w-screen md:h-auto md:w-auto -mt-20 md:mt-0 md:opacity-100 md:translate-y-0 md:pointer-events-auto absolute md:relative -z-1 md:z-0 transition-[opacity,translate] duration-300 ease-out ${mobileNav.open() ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-96 pointer-events-none"}`}
      >
        <ul class="navitems flex items-center flex-col md:flex-row gap-8 md:gap-0 justify-center h-full -translate-y-10 md:translate-y-0 px-8">
          <li>
            <a class="nav-link" href="#">
              Home
            </a>
          </li>
          <li>
            <button type="button" onClick={() => alert("Not implemented")} class="nav-link">
              Create Post
            </button>
          </li>
          <li ref={(el) => (dropdownRef = el)} class="relative">
            <button
              type="button"
              aria-label="Profile menu"
              {...dropdown.triggerProps}
              class="flex items-center gap-2 cursor-pointer select-none"
            >
              <img
                class="h-8 rounded-full object-cover bg-teal-200"
                src={props.profile?.avatarUrl}
                alt={props.profile ? `${props.profile.name} avatar` : ""}
              />
              {props.profile?.name}
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
                  <button type="button" onClick={() => alert("Not implemented")}>
                    Log Out
                  </button>
                </li>
              </ul>
            </div>
          </li>
        </ul>
      </nav>
    </header>
  );
}
