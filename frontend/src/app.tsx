import { MetaProvider } from "@solidjs/meta";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import { ROUTE_CONTENT_ID } from "~/lib/routeContent";
import { AuthProvider } from "~/components/AuthContext";
import { DraftGuardProvider } from "~/components/DraftGuardContext";
import { NewPostProvider } from "~/components/NewPostContext";
import Nav from "~/components/Nav";
import Footer from "~/components/Footer";
import "./app.css";

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <AuthProvider>
            <DraftGuardProvider>
              <NewPostProvider>
                <Nav />
                {/* The route content: a Site menu link choice gives focus to its
                    first item (#248). `contents` adds no box, so the layout is
                    the same. */}
                <div id={ROUTE_CONTENT_ID} class="contents">
                  <Suspense>{props.children}</Suspense>
                </div>
                <Footer />
              </NewPostProvider>
            </DraftGuardProvider>
          </AuthProvider>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
