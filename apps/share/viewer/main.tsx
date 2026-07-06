import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { CodeSnippet } from "@syokan/app/components/CodeSnippet";
import { Render } from "@syokan/app/render";
import type { Item } from "@syokan/app/schema";
import { ViewStateProvider } from "@syokan/app/viewState";
import type { PublicShareResponse } from "../types";

const GITHUB_URL = "https://github.com/wwwyo/syokan";
const INSTALL_COMMAND = "mise use -g github:wwwyo/syokan@latest";

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

type ShareEnvelope = { root: Item; title?: string };

// The envelope is unknown (it may have been posted by an old binary). Just verify
// root exists and hand off to Render — unknown types degrade gracefully via UnknownComponent.
function toShareEnvelope(value: unknown): ShareEnvelope | null {
  if (typeof value !== "object" || value === null) return null;
  const { root, title } = value as { root?: unknown; title?: unknown };
  if (typeof root !== "object" || root === null) return null;
  if (typeof (root as { type?: unknown }).type !== "string") return null;
  return {
    root: root as Item,
    ...(typeof title === "string" && title !== "" ? { title } : {}),
  };
}

// Same rule as ViewPage.isFullBleed: drop the width constraint only for a resizable Stack
function isFullBleed(root: Item): boolean {
  return (
    root.type === "Stack" &&
    (root.props as { resizable?: boolean }).resizable === true
  );
}

function SummonedBadge() {
  return (
    <a
      href="/"
      data-slot="summoned-badge"
      className="inline-flex items-baseline gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-sm transition-colors hover:text-foreground"
    >
      Summoned with <span className="font-semibold text-foreground">syokan</span>
    </a>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-dvh flex-col">{children}</div>;
}

function CenteredNotice({
  message,
  children,
}: {
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-6 px-6 py-16 text-center">
      <p className="text-muted-foreground">{message}</p>
      {children}
    </main>
  );
}

type ShareState =
  | { status: "loading" }
  | { status: "not_found" }
  | { status: "error" }
  | { status: "ready"; share: PublicShareResponse; envelope: ShareEnvelope };

function ShareView({ id }: { id: string }) {
  const [state, setState] = useState<ShareState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/shares/${encodeURIComponent(id)}`);
        if (res.status === 404) {
          if (!cancelled) setState({ status: "not_found" });
          return;
        }
        if (!res.ok) {
          if (!cancelled) setState({ status: "error" });
          return;
        }
        const share = (await res.json()) as PublicShareResponse;
        const envelope = toShareEnvelope(share.envelope);
        if (!cancelled) {
          setState(
            envelope ? { status: "ready", share, envelope } : { status: "error" },
          );
        }
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (state.status === "ready" && state.envelope.title) {
      document.title = `${state.envelope.title} — syokan`;
    }
  }, [state]);

  if (state.status === "loading") {
    return (
      <Shell>
        <CenteredNotice message="Loading…" />
      </Shell>
    );
  }

  if (state.status === "not_found" || state.status === "error") {
    return (
      <Shell>
        <CenteredNotice
          message={
            state.status === "not_found"
              ? "This share has expired or was deleted."
              : "Failed to load this share."
          }
        >
          <a
            href="/"
            className="text-sm text-primary underline underline-offset-4"
          >
            What is syokan?
          </a>
        </CenteredNotice>
        <footer className="flex justify-center py-6">
          <SummonedBadge />
        </footer>
      </Shell>
    );
  }

  const { share, envelope } = state;
  const width = isFullBleed(envelope.root) ? "w-full" : "mx-auto w-full max-w-4xl";
  return (
    <Shell>
      <header className="border-b border-border">
        <div
          className={`${width} flex flex-wrap items-baseline gap-x-3 gap-y-1 px-6 py-3`}
        >
          {envelope.title && (
            <h1 className="text-sm font-medium">{envelope.title}</h1>
          )}
          <span className="text-xs text-muted-foreground">
            published by @{share.publishedBy}
          </span>
          <span className="text-xs text-muted-foreground">
            expires {formatDate(share.expiresAt)}
          </span>
        </div>
      </header>
      <main className={`${width} flex-1 px-6 py-8`}>
        {/* shared=true gates capabilities (Probe rerun etc.); viewers still get their own
            device-local interaction state (collapse/checks/filter) under the share scope */}
        <ViewStateProvider scopeKey={`share:${id}`} shared>
          <Render item={envelope.root} />
        </ViewStateProvider>
      </main>
      <footer className="flex justify-center py-6">
        <SummonedBadge />
      </footer>
    </Shell>
  );
}

function Landing() {
  return (
    <Shell>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-16">
        <h1 className="text-4xl font-bold tracking-tight">syokan</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          LLMs summon rich UI.
        </p>
        <p className="mt-6 leading-relaxed">
          An LLM speaks a JSON incantation, and a rich, living interface appears
          — no JSX written, no build step. Views are ephemeral: summoned when
          needed, they fade; nothing is hoarded.
        </p>
        <CodeSnippet
          code={INSTALL_COMMAND}
          className="mt-8"
          // The public surface is English-first. Don't ride the app i18n's locale auto-switch
          labels={{ copy: "Copy", copied: "Copied" }}
        />
        <p className="mt-2 text-sm text-muted-foreground">
          Install with{" "}
          <a
            href="https://mise.jdx.dev"
            className="underline underline-offset-4 hover:text-foreground"
          >
            mise
          </a>
          , or grab a binary from{" "}
          <a
            href={`${GITHUB_URL}/releases`}
            className="underline underline-offset-4 hover:text-foreground"
          >
            Releases
          </a>
          .
        </p>
      </main>
      <footer className="mx-auto flex w-full max-w-xl items-center gap-4 px-6 py-6 text-xs text-muted-foreground">
        <a href={GITHUB_URL} className="hover:text-foreground">
          GitHub
        </a>
      </footer>
    </Shell>
  );
}

function NotFoundPage() {
  return (
    <Shell>
      <CenteredNotice message="Page not found.">
        <a href="/" className="text-sm text-primary underline underline-offset-4">
          What is syokan?
        </a>
      </CenteredNotice>
      <footer className="flex justify-center py-6">
        <SummonedBadge />
      </footer>
    </Shell>
  );
}

function App() {
  const path = location.pathname;
  if (path === "/") return <Landing />;
  const match = path.match(/^\/shares\/([^/]+)\/?$/);
  const id = match?.[1];
  if (id) return <ShareView id={decodeURIComponent(id)} />;
  return <NotFoundPage />;
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root container #root not found");
}

// Don't use StrictMode: pierre's Code/Diff has a known issue where it collapses on
// StrictMode's remount, so pin the viewer to production-equivalent behavior (AGENTS.md).
createRoot(container).render(<App />);
