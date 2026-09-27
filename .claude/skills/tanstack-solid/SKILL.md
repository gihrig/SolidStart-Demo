---
name: tanstack-solid
description: |
  TanStack libraries for SolidJS: Query (server-state caching), Table, Form, and Virtual. Use when the user mentions TanStack, @tanstack/solid-*, createQuery, createMutation, createSolidTable, createForm, or createVirtualizer.
---

# TanStack for SolidJS

Split from `solidjs-solidstart-expert`. That skill covers core SolidJS/SolidStart patterns.

## Status

The project does not use TanStack yet: `frontend/package.json` has no `@tanstack/*` dependency.
These examples came from the upstream skill and are not verified against the current releases.
Before you add a TanStack dependency, check each example against the current TanStack docs. Two suspected stale APIs:

- **Query v5** — `onError` / `onSuccess` / `onSettled` on `createQuery` (see Debugging below) were removed from queries in v5; mutations keep them.
- **Form v1** — `@tanstack/zod-form-adapter` and `validatorAdapter` (see TanStack Form below) were removed; v1 accepts a Standard Schema (Zod) directly in `validators`.

Testing helpers (`QueryClientProvider` wrappers): `references/testing.md`.

## TanStack Query (Server State)

```typescript
// lib/query.ts
import { QueryClient, QueryClientProvider } from "@tanstack/solid-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

// hooks/useUsers.ts
import { createQuery, createMutation, useQueryClient } from "@tanstack/solid-query";

export function useUsers() {
  return createQuery(() => ({
    queryKey: ["users"],
    queryFn: () => api.getUsers(),
  }));
}

export function useUser(id: Accessor<string>) {
  return createQuery(() => ({
    queryKey: ["users", id()],
    queryFn: () => api.getUser(id()),
    enabled: !!id(),
  }));
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: (data: CreateUserDTO) => api.createUser(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] }),
    onError: (error) => toast.error(error.message),
  }));
}

// ✅ Optimistic updates
export function useUpdateUser() {
  const queryClient = useQueryClient();
  return createMutation(() => ({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserDTO }) => api.updateUser(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ["users", id] });
      const previous = queryClient.getQueryData(["users", id]);
      queryClient.setQueryData(["users", id], (old: User) => ({ ...old, ...data }));
      return { previous };
    },
    onError: (_err, { id }, context) => {
      queryClient.setQueryData(["users", id], context?.previous);
    },
    onSettled: (_, __, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["users", id] });
    },
  }));
}
```

## TanStack Table

```typescript
import {
  createSolidTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, getPaginationRowModel, flexRender,
} from '@tanstack/solid-table';

function UsersTable() {
  const [sorting, setSorting] = createSignal<SortingState>([]);
  const [globalFilter, setGlobalFilter] = createSignal('');

  const table = createSolidTable({
    get data() { return users() ?? []; },
    columns,
    state: {
      get sorting() { return sorting(); },
      get globalFilter() { return globalFilter(); },
    },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <table>
      <thead>
        <For each={table.getHeaderGroups()}>
          {(headerGroup) => (
            <tr>
              <For each={headerGroup.headers}>
                {(header) => (
                  <th onClick={header.column.getToggleSortingHandler()}>
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                )}
              </For>
            </tr>
          )}
        </For>
      </thead>
      <tbody>
        <For each={table.getRowModel().rows}>
          {(row) => (
            <tr>
              <For each={row.getVisibleCells()}>
                {(cell) => <td>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>}
              </For>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  );
}
```

## TanStack Form

```typescript
import { createForm } from '@tanstack/solid-form';
import { zodValidator } from '@tanstack/zod-form-adapter';
import { z } from 'zod';

const userSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

function UserForm() {
  const form = createForm(() => ({
    defaultValues: { name: '', email: '' },
    onSubmit: async ({ value }) => await api.createUser(value),
    validatorAdapter: zodValidator(),
    validators: { onChange: userSchema },
  }));

  return (
    <form onSubmit={(e) => { e.preventDefault(); form.handleSubmit(); }}>
      <form.Field name="name">
        {(field) => (
          <div>
            <input
              value={field().state.value}
              onInput={(e) => field().handleChange(e.currentTarget.value)}
            />
            <Show when={field().state.meta.errors.length}>
              <span class="error">{field().state.meta.errors.join(', ')}</span>
            </Show>
          </div>
        )}
      </form.Field>
      <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
        {([canSubmit, isSubmitting]) => (
          <button disabled={!canSubmit() || isSubmitting()}>
            {isSubmitting() ? 'Saving...' : 'Save'}
          </button>
        )}
      </form.Subscribe>
    </form>
  );
}
```

## TanStack Virtual (Long Lists)

```typescript
// Using @tanstack/solid-virtual
import { createVirtualizer } from '@tanstack/solid-virtual';

function VirtualizedList() {
  let parentRef: HTMLDivElement;
  const [items] = createSignal(Array.from({ length: 10000 }, (_, i) => ({
    id: i,
    name: `Item ${i}`,
  })));

  const virtualizer = createVirtualizer({
    get count() { return items().length; },
    getScrollElement: () => parentRef,
    estimateSize: () => 50,
    overscan: 5,
  });

  return (
    <div
      ref={parentRef!}
      style={{ height: '400px', overflow: 'auto' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        <For each={virtualizer.getVirtualItems()}>
          {(virtualRow) => (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {items()[virtualRow.index].name}
            </div>
          )}
        </For>
      </div>
    </div>
  );
}
```

## Request Deduplication with TanStack Query

```typescript
// TanStack Query automatically dedupes requests
const query = createQuery(() => ({
  queryKey: ['users', userId()],
  queryFn: () => fetchUser(userId()),
  staleTime: 5 * 60 * 1000, // Don't refetch for 5 minutes
}));

// Multiple components using same query = 1 request
function UserName() {
  const query = useUser(userId); // Uses cache
  return <span>{query.data?.name}</span>;
}

function UserAvatar() {
  const query = useUser(userId); // Uses same cache
  return <img src={query.data?.avatar} />;
}
```

## Vendor Chunk

```typescript
// vite.config.ts — build.rollupOptions.output.manualChunks
"vendor-tanstack": ["@tanstack/solid-query", "@tanstack/solid-table"],
```

## TanStack Query Debugging

```typescript
// Enable query devtools
import { QueryClientProvider } from '@tanstack/solid-query';
import { SolidQueryDevtools } from '@tanstack/solid-query-devtools';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* Your app */}
      <SolidQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}

// Log query state changes
import { createQuery } from '@tanstack/solid-query';

const query = createQuery(() => ({
  queryKey: ['users'],
  queryFn: fetchUsers,
  onError: (error) => console.error('[Query Error]', error),
  onSuccess: (data) => console.log('[Query Success]', data),
  onSettled: (data, error) => console.log('[Query Settled]', { data, error }),
}));
```

