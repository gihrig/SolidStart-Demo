---
name: solidjs-solidstart-expert
description: |
  SolidJS and SolidStart development: signals, stores, resources, SSR and streaming, routing, server actions and API routes, performance, and reactivity debugging. Use when working on SolidJS/SolidStart code, or when the user mentions solid, solidjs, solidstart, createSignal, createStore, createResource, vinxi, or fine-grained reactivity.
---

# SolidJS & SolidStart Expert Development Skill

Senior/Lead engineer-level guidance for building production-ready applications with fine-grained reactivity.

## Core Philosophy (KISS, Less is More)

```
1. Signals are primitive. Don't wrap unnecessarily.
2. Derived values > effects. Let reactivity flow naturally.
3. Components are functions called ONCE. Closures handle updates.
4. SSR first, hydrate smart. SolidStart handles this elegantly.
5. Type everything. TypeScript is non-negotiable.
```

## Project Initialization

### SolidStart (Recommended for 95% of projects)

```bash
# Latest SolidStart with TypeScript
vp create solid@latest my-app
# Select: SolidStart, TypeScript, TailwindCSS
```

**Decision matrix**: Use SolidStart unless you're building: embeddable widgets, micro-frontends, or have strict no-server requirements.

## Project Structure (Production-Ready)

```
src/
├── routes/                 # File-based routing (SolidStart)
│   ├── index.tsx          # / route
│   ├── about.tsx          # /about route
│   ├── users/
│   │   ├── index.tsx      # /users
│   │   ├── [id].tsx       # /users/:id (dynamic)
│   │   └── [...all].tsx   # /users/* (catch-all)
│   └── api/               # API routes
│       └── users.ts       # /api/users endpoint
├── components/
│   ├── ui/                # Primitives (Button, Input, Modal)
│   ├── features/          # Feature-specific (UserCard, PostList)
│   └── layouts/           # Layout components (MainLayout, AuthLayout)
├── lib/
│   ├── api/               # API client, fetchers
│   ├── stores/            # Global stores (createStore)
│   ├── signals/           # Shared signals
│   └── utils/             # Pure utility functions
├── hooks/                 # Custom reactive primitives
├── types/                 # TypeScript types/interfaces
├── styles/                # Global styles, Tailwind config
└── entry-server.tsx       # Server entry (SolidStart)
└── entry-client.tsx       # Client entry (SolidStart)
```

## Reactivity Fundamentals

### Signals (Atomic State)

```typescript
import { createSignal, createEffect, createMemo } from "solid-js";

// ✅ CORRECT: Simple, atomic state
const [count, setCount] = createSignal(0);
const [user, setUser] = createSignal<User | null>(null);

// ✅ Derived state with createMemo (NOT createEffect!)
const doubleCount = createMemo(() => count() * 2);
const isLoggedIn = createMemo(() => user() !== null);

// ✅ Effects for side effects ONLY
createEffect(() => {
  console.log("Count changed:", count());
  // Side effect: localStorage, analytics, DOM manipulation
});

// ❌ WRONG: Don't derive state in effects
createEffect(() => {
  setDoubleCount(count() * 2); // Anti-pattern!
});
```

### Stores (Complex State)

```typescript
import { createStore, produce, reconcile } from "solid-js/store";

interface AppState {
  user: User | null;
  todos: Todo[];
  settings: Settings;
}

const [state, setState] = createStore<AppState>({
  user: null,
  todos: [],
  settings: { theme: "dark", lang: "id" },
});

// ✅ Fine-grained updates with produce (Immer-like)
const addTodo = (todo: Todo) => {
  setState(
    produce((s) => {
      s.todos.push(todo);
    }),
  );
};

// ✅ Path-based updates (more performant)
const updateTodo = (id: string, text: string) => {
  setState("todos", (t) => t.id === id, "text", text);
};

// ✅ Replace entire array with reconcile (smart diffing)
const setTodos = (newTodos: Todo[]) => {
  setState("todos", reconcile(newTodos));
};

// ✅ Nested path updates
setState("settings", "theme", "light");
```

### Resources (Async Data)

```typescript
import { createResource, Suspense, ErrorBoundary } from 'solid-js';

// ✅ Basic resource
const [user] = createResource(() => fetchUser(userId()));

// ✅ With source signal (refetches on change)
const [userId, setUserId] = createSignal('1');
const [user, { mutate, refetch }] = createResource(userId, fetchUser);

// ✅ Resource with initial value (SSR-friendly)
const [posts] = createResource(
  () => fetchPosts(),
  { initialValue: [] }
);

// ✅ Usage in components
function UserProfile() {
  return (
    <ErrorBoundary fallback={(err) => <ErrorDisplay error={err} />}>
      <Suspense fallback={<Skeleton />}>
        <Show when={user()} fallback={<NotFound />}>
          {(u) => <UserCard user={u()} />}
        </Show>
      </Suspense>
    </ErrorBoundary>
  );
}
```

## TanStack Integration

TanStack Query, Table, Form, and Virtual live in the `tanstack-solid` skill. The project does not use TanStack yet.

## SolidStart Features

### File-Based Routing

```typescript
// routes/users/[id].tsx
import { useParams } from '@solidjs/router';
import { createAsync, cache } from '@solidjs/router';

const getUser = cache(async (id: string) => {
  'use server';
  return db.user.findUnique({ where: { id } });
}, 'user');

export const route = {
  preload: ({ params }) => getUser(params.id),
};

export default function UserPage() {
  const params = useParams<{ id: string }>();
  const user = createAsync(() => getUser(params.id));

  return (
    <Show when={user()} fallback={<Loading />}>
      {(u) => <UserProfile user={u()} />}
    </Show>
  );
}
```

### API Routes

```typescript
// routes/api/users.ts
import { json } from "@solidjs/router";
import type { APIEvent } from "@solidjs/start/server";

export async function GET(event: APIEvent) {
  const users = await db.user.findMany();
  return json(users);
}

export async function POST(event: APIEvent) {
  const body = await event.request.json();
  const parsed = userSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const user = await db.user.create({ data: parsed.data });
  return json(user, { status: 201 });
}
```

### Server Actions

```typescript
import { action, redirect } from "@solidjs/router";

export const createUserAction = action(async (formData: FormData) => {
  "use server";
  const data = {
    name: formData.get("name") as string,
    email: formData.get("email") as string,
  };
  const parsed = userSchema.safeParse(data);
  if (!parsed.success) return { error: parsed.error.flatten() };
  await db.user.create({ data: parsed.data });
  throw redirect("/users");
});
```

## Error Handling

```typescript
import { ErrorBoundary } from 'solid-js';

function AppErrorBoundary(props: ParentProps) {
  return (
    <ErrorBoundary
      fallback={(err, reset) => (
        <div class="error">
          <h2>Something went wrong</h2>
          <pre>{err.message}</pre>
          <button onClick={reset}>Try again</button>
        </div>
      )}
    >
      {props.children}
    </ErrorBoundary>
  );
}

// Type-Safe Result Pattern
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

async function fetchUser(id: string): Promise<Result<User, ApiError>> {
  try {
    const user = await api.get(`/users/${id}`);
    return { ok: true, value: user };
  } catch (e) {
    return { ok: false, error: e as ApiError };
  }
}
```

## Performance Optimization

### Lazy Loading

```typescript
import { lazy, Suspense } from "solid-js";

const Dashboard = lazy(() => import("./routes/Dashboard"));
const Settings = lazy(() => import("./routes/Settings"));
```

### Avoiding Re-renders

```typescript
// ❌ Creates new object every render
<UserCard user={{ name: name(), email: email() }} />

// ✅ Pass signals directly
<UserCard name={name} email={email} />

// Use <Index> when items don't change, only values
<Index each={items()}>{(item, index) => <Item item={item()} />}</Index>

// Use <For> when items can be reordered
<For each={items()}>{(item) => <Item item={item} />}</For>
```

## Common Pitfalls

### Reactivity Loss

```typescript
// ❌ Destructuring loses reactivity
const { name, email } = props; // BROKEN!

// ✅ Access props directly
<span>{props.name}</span>

// ✅ Or use splitProps
const [local, others] = splitProps(props, ['name', 'email']);
```

### Memory Leaks

```typescript
// ❌ Not cleaning up subscriptions
createEffect(() => {
  const ws = new WebSocket(url);
  ws.onmessage = handleMessage;
});

// ✅ Proper cleanup
createEffect(() => {
  const ws = new WebSocket(url);
  ws.onmessage = handleMessage;
  onCleanup(() => ws.close());
});
```

### SSR Hydration

```typescript
// ❌ Client-only code runs on server
const windowWidth = window.innerWidth; // Error!

// ✅ Use isServer check
import { isServer } from "solid-js/web";
const [width, setWidth] = createSignal(isServer ? 1024 : window.innerWidth);
onMount(() => setWidth(window.innerWidth));
```

## Recommended Libraries

| Category   | Library               | Why                                   |
| ---------- | --------------------- | ------------------------------------- |
| Forms      | @tanstack/solid-form  | Type-safe forms — not in use yet      |
| Data       | @tanstack/solid-query | Server state caching — not in use yet |
| Router     | @solidjs/router       | Official, SSR-ready                   |
| UI         | Kobalte               | Accessible primitives                 |
| Animation  | solid-motionone       | Performant                            |
| Validation | Zod                   | Type-safe schemas                     |
| Icons      | unplugin-icons        | Tree-shakeable                        |
| HTTP       | ky                    | Modern fetch                          |

## Additional References

- `references/patterns.md` - Advanced design patterns & anti-patterns
- `references/debugging.md` - Debugging techniques & DevTools
- `references/performance.md` - Bundle optimization & profiling
- `references/security.md` - Security best practices & auth patterns
- `references/testing.md` - Comprehensive testing strategies
