import { A } from '@solidjs/router'
import Counter from '~/components/Counter'

export default function About() {
  return (
    <main class="text-1xl mx-auto p-4 text-center text-(--theme-foreground)">
      <h1 class="max-6-xs my-16 text-6xl font-thin text-(--theme-accent) uppercase">
        About Page
      </h1>
      <p class="mx-8 mb-4 text-justify">
        Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus
        ex sapien vitae pellentesque sem placerat. In id cursus mi pretium
        tellus duis convallis. Tempus leo eu aenean sed diam urna tempor.
        Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis
        massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper
        vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra
        inceptos himenaeos.
      </p>
      <p class="mx-8 mb-4 text-justify">
        Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus
        ex sapien vitae pellentesque sem placerat. In id cursus mi pretium
        tellus duis convallis. Tempus leo eu aenean sed diam urna tempor.
        Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis
        massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper
        vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra
        inceptos himenaeos.
      </p>
      <p class="mx-8 text-justify">
        Lorem ipsum dolor sit amet consectetur adipiscing elit. Quisque faucibus
        ex sapien vitae pellentesque sem placerat. In id cursus mi pretium
        tellus duis convallis. Tempus leo eu aenean sed diam urna tempor.
        Pulvinar vivamus fringilla lacus nec metus bibendum egestas. Iaculis
        massa nisl malesuada lacinia integer nunc posuere. Ut hendrerit semper
        vel class aptent taciti sociosqu. Ad litora torquent per conubia nostra
        inceptos himenaeos.
      </p>

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
        <A href="/" class="text-(--theme-accent) hover:underline">
          Home
        </A>
        {' - '}
        <span>About Page</span>
      </p>
    </main>
  )
}
