import { A } from '@solidjs/router'
import Counter from '~/components/Counter'

export default function Home() {
  return (
    <main class="mx-auto p-4 text-center text-(--theme-foreground)">
      <h1 class="max-6-xs data-sqlite my-16 text-6xl font-thin text-(--theme-accent) uppercase hover:underline">
        Hello SolidStart!
      </h1>
      <Counter />
      <p class="mt-8">
        Visit{' '}
        <a
          href="https://solidjs.com"
          target="_blank"
          class="text-(--theme-accent) hover:underline"
        >
          solidjs.com
        </a>{' '}
        to learn how to build Solid apps.
      </p>
      <p class="my-4">
        <span>Home</span>
        {' - '}
        <A href="/about" class="text-(--theme-accent) hover:underline">
          About Page
        </A>{' '}
      </p>
    </main>
  )
}
