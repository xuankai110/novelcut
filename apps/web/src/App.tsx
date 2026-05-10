/* NovelCut — root App component.
 *
 * Replaces the upstream open-design 925-line App with a focused short-drama
 * shell. Routing is hash-based so we don\'t fight Next.js\'s catch-all route.
 *
 *   #/                  -> Home (project list)
 *   #/p/<id>            -> Project shell (default tab: novel)
 *   #/p/<id>/<tab>      -> Project shell with active tab
 */
import { useEffect, useState } from "react";
import { Home } from "./novelcut/Home";
import { Project } from "./novelcut/Project";
import { Layout } from "./novelcut/Layout";
import "@xyflow/react/dist/style.css";
import "./novelcut/styles.css";

type Route =
  | { kind: "home" }
  | { kind: "project"; id: string; tab: string };

function parseHash(hash: string): Route {
  const h = hash.replace(/^#\/?/, "");
  if (!h) return { kind: "home" };
  const m = h.match(/^p\/([^/]+)(?:\/([^/]+))?\/?$/);
  if (m) return { kind: "project", id: m[1], tab: m[2] ?? "novel" };
  return { kind: "home" };
}

export function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setRoute(parseHash(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <Layout route={route}>
      {route.kind === "home" && <Home />}
      {route.kind === "project" && <Project projectId={route.id} tab={route.tab} />}
    </Layout>
  );
}
