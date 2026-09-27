# Tailwind Design System: Advanced Patterns

Advanced Tailwind CSS v4 patterns including animations, dark mode theming, custom utilities, theme modifiers, namespace overrides, and the v3-to-v4 migration checklist.

## Pattern 5: Native CSS Animations (v4)

```css
/* In your CSS file - native @starting-style for entry animations */
@theme {
  --animate-dialog-in: dialog-fade-in 0.2s ease-out;
  --animate-dialog-out: dialog-fade-out 0.15s ease-in;
}

@keyframes dialog-fade-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-0.5rem);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

@keyframes dialog-fade-out {
  from {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
  to {
    opacity: 0;
    transform: scale(0.95) translateY(-0.5rem);
  }
}

/* Native popover animations using @starting-style */
[popover] {
  transition:
    opacity 0.2s,
    transform 0.2s,
    display 0.2s allow-discrete;
  opacity: 0;
  transform: scale(0.95);
}

[popover]:popover-open {
  opacity: 1;
  transform: scale(1);
}

@starting-style {
  [popover]:popover-open {
    opacity: 0;
    transform: scale(0.95);
  }
}
```

```tsx
// components/ui/dialog.tsx - Kobalte dialog (accessible primitive for Solid)
import { splitProps, type JSX, type ValidComponent } from 'solid-js'
import * as DialogPrimitive from '@kobalte/core/dialog'
import type { PolymorphicProps } from '@kobalte/core/polymorphic'
import { cn } from '~/lib/utils'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal

// Kobalte sets `data-expanded` while open and waits for the exit
// animation to end before it unmounts the element.
type DialogOverlayProps<T extends ValidComponent = 'div'> =
  DialogPrimitive.DialogOverlayProps<T> & { class?: string }

export function DialogOverlay<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, DialogOverlayProps<T>>
) {
  const [local, others] = splitProps(props as DialogOverlayProps, ['class'])
  return (
    <DialogPrimitive.Overlay
      class={cn(
        'fixed inset-0 z-50 bg-black/80',
        'animate-fade-out data-expanded:animate-fade-in',
        local.class
      )}
      {...others}
    />
  )
}

type DialogContentProps<T extends ValidComponent = 'div'> =
  DialogPrimitive.DialogContentProps<T> & { class?: string; children?: JSX.Element }

export function DialogContent<T extends ValidComponent = 'div'>(
  props: PolymorphicProps<T, DialogContentProps<T>>
) {
  const [local, others] = splitProps(props as DialogContentProps, ['class', 'children'])
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        class={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border border-border bg-background p-6 shadow-lg sm:rounded-lg',
          'animate-dialog-out data-expanded:animate-dialog-in',
          local.class
        )}
        {...others}
      >
        {local.children}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}
```

## Pattern 6: Dark Mode with CSS (v4)

```tsx
// providers/ThemeProvider.tsx - Simplified for v4
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
  useContext,
  type Accessor,
  type ParentProps,
} from 'solid-js'

type Theme = 'dark' | 'light' | 'system'

interface ThemeContextValue {
  theme: Accessor<Theme>
  setTheme: (theme: Theme) => void
  resolvedTheme: Accessor<'dark' | 'light'>
}

const ThemeContext = createContext<ThemeContextValue>()

export interface ThemeProviderProps extends ParentProps {
  defaultTheme?: Theme
  storageKey?: string
}

export function ThemeProvider(props: ThemeProviderProps) {
  // Config: read once at creation, not reactive
  const storageKey = props.storageKey ?? 'theme'
  const [theme, setThemeValue] = createSignal<Theme>(props.defaultTheme ?? 'system')
  const [prefersDark, setPrefersDark] = createSignal(false)

  // Derived state: a memo, not an effect that sets a signal
  const resolvedTheme = createMemo(() => {
    const current = theme()
    if (current !== 'system') return current
    return prefersDark() ? 'dark' : 'light'
  })

  // onMount runs only in the browser, so SSR never touches localStorage or matchMedia
  onMount(() => {
    const stored = localStorage.getItem(storageKey) as Theme | null
    if (stored) setThemeValue(stored)

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    setPrefersDark(media.matches)
    const onChange = (e: MediaQueryListEvent) => setPrefersDark(e.matches)
    media.addEventListener('change', onChange)
    onCleanup(() => media.removeEventListener('change', onChange))
  })

  // Side effect only: sync the DOM to the theme
  createEffect(() => {
    const root = document.documentElement
    const current = theme()
    // 'system' removes the attribute, so the prefers-color-scheme CSS block applies
    if (current === 'system') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', current)

    const resolved = resolvedTheme()
    // Native controls and scrollbars follow the resolved theme
    root.style.colorScheme = resolved

    // Update meta theme-color for mobile browsers
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved === 'dark' ? '#09090b' : '#ffffff')
  })

  const setTheme = (next: Theme) => {
    localStorage.setItem(storageKey, next)
    setThemeValue(next)
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {props.children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}

// components/ThemeToggle.tsx
import { Show } from 'solid-js'
import { Moon, Sun } from 'lucide-solid'
import { useTheme } from '~/providers/ThemeProvider'
import { Button } from '~/components/ui/button'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark')}
    >
      {/* The resolved theme picks the icon - no dark: variant */}
      <Show when={resolvedTheme() === 'dark'} fallback={<Sun class="size-5" />}>
        <Moon class="size-5" />
      </Show>
      <span class="sr-only">Toggle theme</span>
    </Button>
  )
}
```

## Advanced v4 Patterns

### Custom Utilities with `@utility`

Define reusable custom utilities:

```css
/* Custom utility for decorative lines - the border token changes with the theme */
@utility line-t {
  @apply relative before:absolute before:top-0 before:-left-[100vw] before:h-px before:w-[200vw] before:bg-border;
}

/* Custom utility for text gradients */
@utility text-gradient {
  @apply bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent;
}
```

### Theme Modifiers

```css
/* Use @theme inline when referencing other CSS variables */
@theme inline {
  --font-sans: var(--font-inter), system-ui;
}

/* Use @theme static to always generate CSS variables (even when unused) */
@theme static {
  --color-brand: oklch(65% 0.15 240);
}

/* Import with theme options */
@import "tailwindcss" theme(static);
```

### Namespace Overrides

```css
@theme {
  /* Clear all default colors and define your own */
  --color-*: initial;
  --color-white: #fff;
  --color-black: #000;
  --color-primary: oklch(45% 0.2 260);
  --color-secondary: oklch(65% 0.15 200);

  /* Clear ALL defaults for a minimal setup */
  /* --*: initial; */
}
```

### Semi-transparent Color Variants

```css
@theme {
  /* Use color-mix() for alpha variants */
  --color-primary-50: color-mix(in oklab, var(--color-primary) 5%, transparent);
  --color-primary-100: color-mix(
    in oklab,
    var(--color-primary) 10%,
    transparent
  );
  --color-primary-200: color-mix(
    in oklab,
    var(--color-primary) 20%,
    transparent
  );
}
```

### Container Queries

```css
@theme {
  --container-xs: 20rem;
  --container-sm: 24rem;
  --container-md: 28rem;
  --container-lg: 32rem;
}
```

## v3 to v4 Migration Checklist

- [ ] Replace `tailwind.config.ts` with CSS `@theme` block
- [ ] Change `@tailwind base/components/utilities` to `@import "tailwindcss"`
- [ ] Move color definitions to `@theme { --color-*: value }`
- [ ] Replace `darkMode: "class"` with token overrides under `:root[data-theme="dark"]`
- [ ] Move `@keyframes` inside `@theme` blocks (ensures keyframes output with theme)
- [ ] Replace `require("tailwindcss-animate")` with native CSS animations
- [ ] Update `h-10 w-10` to `size-10` (new utility)
- [ ] Consider OKLCH colors for better color perception
- [ ] Replace custom plugins with `@utility` directives

## Best Practices

### Do's

- **Use `@theme` blocks** - CSS-first configuration is v4's core pattern
- **Use OKLCH colors** - Better perceptual uniformity than HSL
- **Compose with CVA** - Type-safe variants
- **Use semantic tokens** - `bg-primary` not `bg-blue-500`
- **Use `size-*`** - New shorthand for `w-* h-*`
- **Add accessibility** - ARIA attributes, focus states

### Don'ts

- **Don't use `tailwind.config.ts`** - Use CSS `@theme` instead
- **Don't use `@tailwind` directives** - Use `@import "tailwindcss"`
- **Don't destructure props** - Solid loses reactivity; use `splitProps`
- **Don't use arbitrary values** - Extend `@theme` instead
- **Don't hardcode colors** - Use semantic tokens
- **Don't use `dark:` utilities** - Override tokens under `[data-theme="dark"]` instead
- **Don't forget dark mode** - Test light, dark and system themes
