import { createSignal, Show } from "solid-js";
import { useIsMobile } from "~/lib/useIsMobile";
import { useDismiss } from "~/lib/useDismiss";
import { getSystemIcon } from "~/lib/system-icons";

export default function JediNav() {
  const [mobileNavOpen, setMobileNavOpen] = createSignal(false);
  const [dropdownOpen, setDropdownOpen] = createSignal(false);
  const isMobile = useIsMobile();
  let dropdownRef: HTMLLIElement | undefined;

  useDismiss(
    () => setMobileNavOpen(false),
    () => mobileNavOpen() && !dropdownOpen(),
  );
  useDismiss(
    () => setDropdownOpen(false),
    dropdownOpen,
    () => dropdownRef,
  );

  const MENU_ICON = getSystemIcon("Menu");
  const DELETE_ICON = getSystemIcon("Delete");

  return (
    <header class="jedi-header">
      <div class="flex items-center justify-between h-20 px-8">
        <a class="flex items-center gap-1" href="/jedi">
          <svg class="w-8 h-8 -mt-1">
            <use href="#icon-fire-heart"></use>
          </svg>
          <span class="text-lg font-bold">Awesome</span>
        </a>
        <button
          type="button"
          aria-label="Toggle navigation"
          aria-expanded={mobileNavOpen()}
          onClick={() => setMobileNavOpen(!mobileNavOpen())}
          class="md:hidden h-12 w-12 flex items-center justify-center cursor-pointer hover:bg-gray-700 rounded-lg"
        >
          <Show
            when={mobileNavOpen()}
            fallback={
              <svg class="w-6 h-6 select-none">
                <use href={MENU_ICON.icon}></use>
              </svg>
            }
          >
            <svg class="w-6 h-6 select-none">
              <use href={DELETE_ICON.icon}></use>
            </svg>
          </Show>
        </button>
      </div>
      <nav
        inert={isMobile() && !mobileNavOpen()}
        aria-label="Jedi site navigation"
        class={`bg-gray-800 h-screen w-screen md:h-auto md:w-auto -mt-20 md:mt-0 md:opacity-100 md:translate-y-0 md:pointer-events-auto absolute md:relative -z-1 md:z-0 transition-[opacity,transform] duration-300 ease-out ${mobileNavOpen() ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-96 pointer-events-none"}`}
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
              aria-controls="jedi-profile-menu"
              aria-expanded={dropdownOpen()}
              onClick={() => setDropdownOpen(!dropdownOpen())}
              class="flex items-center gap-2 cursor-pointer select-none"
            >
              <img
                class="h-8 rounded-full object-cover bg-teal-200"
                src="https://img.icons8.com/doodle/96/null/bart-simpson.png"
                alt="Bart avatar"
              />
              Bart
              <img
                class={`w-4 transition-transform duration-300 ${dropdownOpen() ? "rotate-180" : ""}`}
                src="https://img.icons8.com/small/32/777777/expand-arrow.png"
                alt=""
              />
            </button>
            <div
              id="jedi-profile-menu"
              inert={!dropdownOpen()}
              aria-hidden={!dropdownOpen()}
              class={`absolute right-0 bg-(--theme-card-bg) text-(--theme-card-fg) shadow rounded-lg w-40 p-2 z-20 transition-[opacity,transform] duration-300 ease-out origin-top ${dropdownOpen() ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-90 -translate-y-5 pointer-events-none"}`}
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
