import { MetaProvider } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import { AuthProvider } from "~/components/AuthContext";
import Nav from "~/components/Nav";
import Footer from "~/components/Footer";
import "./app.css";

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <AuthProvider>
            <Nav />
            <Suspense>{props.children}</Suspense>
            <Footer />
          </AuthProvider>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
