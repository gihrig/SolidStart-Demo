# Testing with TanStack Query

Test patterns for components that read from TanStack Query. The generic test setup lives in `solidjs-solidstart-expert/references/testing.md`.

## Testing Async Components

```typescript
// components/__tests__/UserList.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@solidjs/testing-library';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { UserList } from '../features/users/UserList';
import * as api from '~/lib/api';

vi.mock('~/lib/api');

describe('UserList', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
    vi.clearAllMocks();
  });

  const renderWithQuery = (component: () => JSX.Element) => {
    return render(() => (
      <QueryClientProvider client={queryClient}>
        {component()}
      </QueryClientProvider>
    ));
  };

  it('shows loading state', () => {
    vi.mocked(api.getUsers).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithQuery(() => <UserList />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows users when loaded', async () => {
    vi.mocked(api.getUsers).mockResolvedValue([
      { id: '1', name: 'John Doe', email: 'john@example.com' },
      { id: '2', name: 'Jane Doe', email: 'jane@example.com' },
    ]);

    renderWithQuery(() => <UserList />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
  });

  it('shows error state', async () => {
    vi.mocked(api.getUsers).mockRejectedValue(new Error('Network error'));

    renderWithQuery(() => <UserList />);

    await waitFor(() => {
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });
  });

  it('shows empty state', async () => {
    vi.mocked(api.getUsers).mockResolvedValue([]);

    renderWithQuery(() => <UserList />);

    await waitFor(() => {
      expect(screen.getByText(/no users found/i)).toBeInTheDocument();
    });
  });
});
```

## Test Utils: Query Provider Wrapper

```typescript
// src/test/utils.tsx
import { render, RenderOptions } from '@solidjs/testing-library';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { Router } from '@solidjs/router';
import { ParentComponent, JSX } from 'solid-js';

interface ProvidersProps {
  queryClient?: QueryClient;
}

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });
}

export function createWrapper(options: ProvidersProps = {}): ParentComponent {
  const queryClient = options.queryClient ?? createTestQueryClient();

  return (props) => (
    <QueryClientProvider client={queryClient}>
      <Router>
        {props.children}
      </Router>
    </QueryClientProvider>
  );
}

export function renderWithProviders(
  ui: () => JSX.Element,
  options?: Omit<RenderOptions, 'wrapper'> & ProvidersProps
) {
  const { queryClient, ...renderOptions } = options ?? {};

  return render(ui, {
    wrapper: createWrapper({ queryClient }),
    ...renderOptions,
  });
}
```
