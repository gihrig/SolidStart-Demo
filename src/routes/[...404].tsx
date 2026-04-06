import { Title } from '@solidjs/meta'
import { A } from '@solidjs/router'

export default function NotFound() {
  return (
    <>
      <Title>SolidStart 404</Title>
      <main>
        <h1>404 - Page Not Found</h1>
        <br />
        <P>Try one of these pages</P>
        <A href="/">Home</A>
        <A href="/about">About</A>
        <A href="/readme">Readme</A>
        <A href="/fullstack">FullStack</A>
      </main>
    </>
  )
}
