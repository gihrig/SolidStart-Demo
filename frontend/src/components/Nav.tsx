import { createEffect, createSignal, For, on, Show } from "solid-js";
import { A, useIsRouting, useLocation } from "@solidjs/router";
import { keepDialogFocus } from "~/lib/keepDialogFocus";
import { focusRouteContent } from "~/lib/routeContent";
import { useDisclosure } from "~/lib/useDisclosure";
import { useAuth } from "~/components/AuthContext";
import { useDraftGuard } from "~/components/DraftGuardContext";
import { useNewPost } from "~/components/NewPostContext";
import Avatar from "~/components/Avatar";
import Icon from "~/components/Icon";
import LoginDialog from "~/components/LoginDialog";
import ThemeChoice from "~/components/ThemeChoice";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/readme", label: "Readme" },
] as const;

export default function Nav() {
  let dropdownRef: HTMLDivElement | undefined;
  let profileTriggerRef: HTMLButtonElement | undefined;
  let myProfileRef: HTMLButtonElement | undefined;
  let siteToggleRef: HTMLButtonElement | undefined;
  let siteMenuRef: HTMLElement | undefined;

  // Identity (avatar + display name) comes from the useAuth seam: the logged-in
  // User's profile lives there, not here (see ADR-0007).
  const { isAuthenticated, logoff, displayName, avatarUrl } = useAuth();
  // A logoff unmounts every form, so it goes through the Draft guard (ADR-0030).
  const guard = useDraftGuard();
  const newPost = useNewPost();

  // The Profile menu is a popup — hidden (and inert) whenever closed, on every
  // viewport — dismissed by Escape, a click outside its wrapping <div>, or focus
  // that moves outside it. A Theme choice is a click inside, so it keeps the menu
  // open (#200). An open gives focus to My Profile; Escape gives it back to the
  // Profile menu button, so focus does not stay in the inert panel (#248).
  const dropdown = useDisclosure({
    id: "profile-menu",
    mode: "popup",
    ref: () => dropdownRef,
    closeOnFocusOut: true,
    initialFocus: () => myProfileRef,
    returnFocus: () => profileTriggerRef,
  });
  // The Site menu closes on Escape, a click outside, or focus that moves
  // outside. No one element holds the menu and its toggle button, so both make
  // the inside; a toggle click opens or closes it once (#248).
  const mobileNav = useDisclosure({
    id: "site-mobile-nav",
    ref: () => [siteToggleRef, siteMenuRef],
    closeOnFocusOut: true,
  });

  // A Site menu link choice closes the menu, and focus goes to the new page's
  // route content, else to the toggle button (#248). The Nav is outside the
  // route <Suspense>, so the new page is in place only when routing ends. The
  // router routes in its own click listener, so the check runs after the click.
  // A choice of the current page starts no routing. A move that the Draft guard
  // holds back starts none either, and moves no focus.
  const isRouting = useIsRouting();
  const location = useLocation();
  let focusAfterRoute = false;
  createEffect(
    on(
      isRouting,
      (routing) => {
        if (routing || !focusAfterRoute) return;
        focusAfterRoute = false;
        focusRouteContent(siteToggleRef);
      },
      { defer: true },
    ),
  );
  const chooseLink = (href: string) => {
    mobileNav.close();
    setTimeout(() => {
      if (isRouting()) focusAfterRoute = true;
      else if (location.pathname === href) focusRouteContent(siteToggleRef);
    });
  };

  // The login dialog (#128). Log In sits in the dropdown, so the click closes the
  // dropdown first. On close, focus goes to the Profile menu button: the Log In
  // button that had it is now inert, or gone after a login.
  const [loginOpen, setLoginOpen] = createSignal(false);
  const openLogin = () => {
    dropdown.toggle();
    setLoginOpen(true);
  };
  const closeLogin = () => {
    setLoginOpen(false);
    profileTriggerRef?.focus();
  };
  // Log Out closes the menu (#248). Focus goes to the Profile menu button first:
  // the Log Out button is in the inert panel, and a logoff removes it. A Draft
  // dialog then gives focus back to that button when it closes.
  const logOut = () => {
    dropdown.close();
    profileTriggerRef?.focus();
    guard.attempt(() => void logoff());
  };

  return (
    <header class="site-header">
      <div class="flex items-center justify-between h-20 px-8">
        <a class="brand-link" href="/">
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
                    <A class="nav-link" href={link.href} end>
                      {link.label}
                    </A>
                  </li>
                )}
              </For>
            </ul>
          </nav>

          {/* Profile dropdown — always visible */}
          <div ref={(el) => (dropdownRef = el)} class="relative">
            <button
              ref={(el) => (profileTriggerRef = el)}
              type="button"
              aria-label="Profile menu"
              {...dropdown.triggerProps}
              class="flex items-center gap-2 rounded-md cursor-pointer select-none"
            >
              <Avatar
                src={avatarUrl()}
                name={displayName() ?? ""}
                alt={displayName() ? `${displayName()} avatar` : ""}
                data-testid="avatar"
                imageTestId="avatar"
              />
              <span class="hidden sm:inline">{displayName()}</span>
              <Icon
                name="expand-arrow"
                class={`w-4 h-4 transition-transform duration-300 ${dropdown.open() ? "rotate-180" : ""}`}
              />
            </button>
            {/* Tab and Shift+Tab stay in the open panel, and wrap (#248) */}
            <div
              {...dropdown.panelProps}
              onKeyDown={keepDialogFocus}
              class={`absolute right-0 bg-(--theme-card-bg) text-(--theme-card-fg) shadow rounded-lg w-48 p-2 z-20 transition-[opacity,translate,scale] duration-300 ease-out origin-top ${dropdown.open() ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-90 -translate-y-5 pointer-events-none"}`}
            >
              <ul class="hoverlist">
                <li>
                  <button
                    ref={(el) => (myProfileRef = el)}
                    type="button"
                    onClick={() => alert("Not implemented")}
                  >
                    My Profile
                  </button>
                </li>
                <li>
                  <Show
                    when={isAuthenticated()}
                    fallback={
                      <button type="button" onClick={openLogin}>
                        Log In
                      </button>
                    }
                  >
                    <button type="button" onClick={logOut}>
                      Log Out
                    </button>
                  </Show>
                </li>
              </ul>
              {/* The one theme control, at every width (#200) */}
              <div class="mt-2 border-t border-(--theme-muted) pt-2">
                <ThemeChoice />
              </div>
            </div>
          </div>

          <LoginDialog open={loginOpen()} onClose={closeLogin} />

          {/* Create a Post (#120) — a logged-in User only. It opens the one New
              Post dialog (#214). */}
          <Show when={isAuthenticated()}>
            <button
              type="button"
              onClick={(e) => newPost.open(e.currentTarget)}
              class="theme-button"
            >
              New Post
            </button>
          </Show>

          {/* Mobile menu toggle */}
          <button
            ref={(el) => (siteToggleRef = el)}
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

      {/* Mobile menu — the links. The avatar and the Profile menu, with the
          Theme items, stay in the top bar (#200). */}
      <nav
        ref={(el) => (siteMenuRef = el)}
        {...mobileNav.panelProps}
        aria-label="Site menu"
        class={`md:hidden absolute inset-x-0 top-full bg-gray-800 transition-[opacity,translate] duration-300 ease-out ${mobileNav.open() ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4 pointer-events-none"}`}
      >
        {/* Each link fills its row, less a 16px margin on each side, so a tap
            anywhere on the link's highlight follows it (#247). The text stays
            centered. */}
        <ul class="site-nav flex flex-col gap-4 py-6">
          <For each={NAV_LINKS}>
            {(link) => (
              <li>
                <A
                  class="nav-link justify-center mx-4"
                  href={link.href}
                  end
                  onClick={() => chooseLink(link.href)}
                >
                  {link.label}
                </A>
              </li>
            )}
          </For>
        </ul>
      </nav>
    </header>
  );
}
