import { Title } from "@solidjs/meta";
import Counter from "~/components/Counter";

export default function Home() {
  return (
    <>
      <Title>SolidStart+</Title>
      <div class="demo">
        <main>
          <h1>Hello SolidStart!</h1>
          <Counter />
        </main>
      </div>
    </>
  );
}
