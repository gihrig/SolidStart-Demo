import { MetaProvider } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import Nav from "~/components/Nav";
import Footer from "~/components/Footer";
import "./app.css";
import spriteRaw from "~/icon-sprite.svg?raw";

export default function App() {
  return (
    <Router
      root={(props) => (
        <>
          <MetaProvider>
            <div hidden innerHTML={spriteRaw} />
            <Nav />
            <Suspense>{props.children}</Suspense>
            <Footer />
          </MetaProvider>
        </>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
