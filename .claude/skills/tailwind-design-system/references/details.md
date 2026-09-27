# tailwind-design-system — detailed patterns and worked examples

Component examples use SolidJS. They need `class-variance-authority`, `clsx`, `tailwind-merge`,
`zod` (v4), and for the advanced patterns `@kobalte/core` and `lucide-solid`. `~/` is the `src/` alias.

## Patterns

### Pattern 1: CVA (Class Variance Authority) Components

```tsx
// components/ui/button.tsx
import { splitProps, type ComponentProps } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '~/lib/utils'

export const buttonVariants = cva(
  // Base styles - v4 uses native CSS variables
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-border bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {}

// Solid: never destructure props (it breaks reactivity) - use splitProps.
// `ref` needs no forwarding: it stays in `others` and the spread applies it.
export function Button(props: ButtonProps) {
  const [local, others] = splitProps(props, ['class', 'variant', 'size'])
  return (
    <button
      class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)}
      {...others}
    />
  )
}

// Usage
<Button variant="destructive" size="lg">Delete</Button>
<Button variant="outline">Cancel</Button>

// Button styles on another element (replaces React's asChild/Slot):
// apply the exported variants to that element directly.
import { A } from '@solidjs/router'
<A href="/home" class={buttonVariants()}>Home</A>
```

### Pattern 2: Compound Components

```tsx
// components/ui/card.tsx
import { splitProps, type ComponentProps } from 'solid-js'
import { cn } from '~/lib/utils'

export function Card(props: ComponentProps<'div'>) {
  const [local, others] = splitProps(props, ['class'])
  return (
    <div
      class={cn(
        'rounded-lg border border-border bg-card text-card-foreground shadow-sm',
        local.class
      )}
      {...others}
    />
  )
}

export function CardHeader(props: ComponentProps<'div'>) {
  const [local, others] = splitProps(props, ['class'])
  return <div class={cn('flex flex-col space-y-1.5 p-6', local.class)} {...others} />
}

export function CardTitle(props: ComponentProps<'h3'>) {
  const [local, others] = splitProps(props, ['class'])
  return (
    <h3
      class={cn('text-2xl font-semibold leading-none tracking-tight', local.class)}
      {...others}
    />
  )
}

export function CardDescription(props: ComponentProps<'p'>) {
  const [local, others] = splitProps(props, ['class'])
  return <p class={cn('text-sm text-muted-foreground', local.class)} {...others} />
}

export function CardContent(props: ComponentProps<'div'>) {
  const [local, others] = splitProps(props, ['class'])
  return <div class={cn('p-6 pt-0', local.class)} {...others} />
}

export function CardFooter(props: ComponentProps<'div'>) {
  const [local, others] = splitProps(props, ['class'])
  return <div class={cn('flex items-center p-6 pt-0', local.class)} {...others} />
}

// Usage
<Card>
  <CardHeader>
    <CardTitle>Account</CardTitle>
    <CardDescription>Manage your account settings</CardDescription>
  </CardHeader>
  <CardContent>
    <form>...</form>
  </CardContent>
  <CardFooter>
    <Button>Save</Button>
  </CardFooter>
</Card>
```

### Pattern 3: Form Components

```tsx
// components/ui/input.tsx
import { Show, splitProps, type ComponentProps } from 'solid-js'
import { cn } from '~/lib/utils'

export interface InputProps extends ComponentProps<'input'> {
  error?: string
}

export function Input(props: InputProps) {
  const [local, others] = splitProps(props, ['class', 'error'])
  const errorId = () => `${others.id}-error`

  return (
    <div class="relative">
      <input
        class={cn(
          'flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          local.error && 'border-destructive focus-visible:ring-destructive',
          local.class
        )}
        aria-invalid={!!local.error}
        aria-describedby={local.error ? errorId() : undefined}
        {...others}
      />
      <Show when={local.error}>
        <p id={errorId()} class="mt-1 text-sm text-destructive" role="alert">
          {local.error}
        </p>
      </Show>
    </div>
  )
}

// components/ui/label.tsx
import { splitProps, type ComponentProps } from 'solid-js'
import { cva } from 'class-variance-authority'
import { cn } from '~/lib/utils'

const labelVariants = cva(
  'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70'
)

export function Label(props: ComponentProps<'label'>) {
  const [local, others] = splitProps(props, ['class'])
  return <label class={cn(labelVariants(), local.class)} {...others} />
}

// Usage with Zod (v4) - uncontrolled inputs, validate on submit
import { createSignal, type JSX } from 'solid-js'
import { z } from 'zod'

const schema = z.object({
  email: z.email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

type LoginValues = z.infer<typeof schema>
type FieldErrors = Partial<Record<keyof LoginValues, string[]>>

export interface LoginFormProps {
  onSubmit: (values: LoginValues) => void
}

function LoginForm(props: LoginFormProps) {
  const [errors, setErrors] = createSignal<FieldErrors>({})

  const handleSubmit: JSX.EventHandler<HTMLFormElement, SubmitEvent> = (e) => {
    e.preventDefault()
    const result = schema.safeParse(Object.fromEntries(new FormData(e.currentTarget)))
    if (!result.success) {
      setErrors(z.flattenError(result.error).fieldErrors)
      return
    }
    setErrors({})
    props.onSubmit(result.data)
  }

  return (
    <form onSubmit={handleSubmit} class="space-y-4">
      <div class="space-y-2">
        <Label for="email">Email</Label>
        <Input id="email" name="email" type="email" error={errors().email?.[0]} />
      </div>
      <div class="space-y-2">
        <Label for="password">Password</Label>
        <Input id="password" name="password" type="password" error={errors().password?.[0]} />
      </div>
      <Button type="submit" class="w-full">Sign In</Button>
    </form>
  )
}
```

### Pattern 4: Responsive Grid System

```tsx
// components/ui/grid.tsx
import { splitProps, type ComponentProps } from 'solid-js'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '~/lib/utils'

const gridVariants = cva('grid', {
  variants: {
    cols: {
      1: 'grid-cols-1',
      2: 'grid-cols-1 sm:grid-cols-2',
      3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
      5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
      6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
    },
    gap: {
      none: 'gap-0',
      sm: 'gap-2',
      md: 'gap-4',
      lg: 'gap-6',
      xl: 'gap-8',
    },
  },
  defaultVariants: {
    cols: 3,
    gap: 'md',
  },
})

export interface GridProps
  extends ComponentProps<'div'>,
    VariantProps<typeof gridVariants> {}

export function Grid(props: GridProps) {
  const [local, others] = splitProps(props, ['class', 'cols', 'gap'])
  return (
    <div
      class={cn(gridVariants({ cols: local.cols, gap: local.gap }), local.class)}
      {...others}
    />
  )
}

// Container component
const containerVariants = cva('mx-auto w-full px-4 sm:px-6 lg:px-8', {
  variants: {
    size: {
      sm: 'max-w-screen-sm',
      md: 'max-w-screen-md',
      lg: 'max-w-screen-lg',
      xl: 'max-w-screen-xl',
      '2xl': 'max-w-screen-2xl',
      full: 'max-w-full',
    },
  },
  defaultVariants: {
    size: 'xl',
  },
})

export interface ContainerProps
  extends ComponentProps<'div'>,
    VariantProps<typeof containerVariants> {}

export function Container(props: ContainerProps) {
  const [local, others] = splitProps(props, ['class', 'size'])
  return (
    <div class={cn(containerVariants({ size: local.size }), local.class)} {...others} />
  )
}

// Usage - <For> keys rows by reference, so no `key` prop
<Container>
  <Grid cols={4} gap="lg">
    <For each={products()}>{(product) => <ProductCard product={product} />}</For>
  </Grid>
</Container>
```

For advanced animation and dark mode patterns, see [advanced-patterns.md](advanced-patterns.md):

- **Pattern 5: Native CSS Animations** — dialog `@keyframes`, native popover API with `@starting-style`, `allow-discrete` transitions, and a full `DialogContent`/`DialogOverlay` implementation using Kobalte
- **Pattern 6: Dark Mode** — `ThemeProvider` context that sets `data-theme` on `<html>`, with `localStorage` persistence, `prefers-color-scheme` detection, meta `theme-color` update, and a `ThemeToggle` button component

## Utility Functions

```typescript
// lib/utils.ts
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Focus ring utility
export const focusRing = cn(
  "focus-visible:outline-none focus-visible:ring-2",
  "focus-visible:ring-ring focus-visible:ring-offset-2",
);

// Disabled utility
export const disabled = "disabled:pointer-events-none disabled:opacity-50";
```

For advanced v4 CSS patterns, the full v3-to-v4 migration checklist, and complete best practices, see [advanced-patterns.md](advanced-patterns.md):

- **Custom `@utility`** — reusable CSS utilities for decorative lines and text gradients
- **Theme modifiers** — `@theme inline` (reference other CSS vars), `@theme static` (always output), `@import "tailwindcss" theme(static)`
- **Namespace overrides** — clearing default Tailwind color scales with `--color-*: initial`
- **Semi-transparent variants** — `color-mix()` for alpha scale generation
- **Container queries** — `--container-*` token definitions
- **v3→v4 migration checklist** — 9-item checklist covering config, directives, colors, dark mode, animations, plugins
- **Best practices** — full Do's and Don'ts list
