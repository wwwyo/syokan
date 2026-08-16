import { Maximize2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "../../components/ui/dialog";
import { t } from "../../lib/i18n";
import { useColorScheme } from "../../lib/useColorScheme";

export const mermaidPropsSchema = z
  .object({
    // mermaid diagram source (e.g. "graph TD; A-->B")
    code: z.string().min(1),
  })
  .strict();

export type MermaidProps = z.infer<typeof mermaidPropsSchema>;

/** Renders mermaid source to an SVG string. Throws on parse failure (mermaid injects no error DOM). */
async function renderMermaid(
  code: string,
  renderId: string,
  scheme: "light" | "dark",
): Promise<string> {
  const mermaid = (await import("mermaid")).default;
  mermaid.initialize({
    startOnLoad: false,
    theme: scheme === "dark" ? "dark" : "default",
    // code is external / LLM-sourced. Sanitize HTML inside labels (the default, made explicit)
    securityLevel: "strict",
    // suppress mermaid from injecting an error diagram into document.body on parse failure,
    // and have it remove the temp element and throw. Failures are funneled to the <pre> fallback in the catch below.
    // (wrapping via the container arg is an option, but it breaks rendering multiple diagrams at once, so it is not used)
    suppressErrorRendering: true,
  });
  const { svg } = await mermaid.render(renderId, code);
  return svg;
}

// mermaid's parse errors run several lines (source excerpt + caret + expected tokens); keep enough
// to locate the problem without letting a pathological message take over the view.
const ERROR_MAX_LENGTH = 600;

/** The reason to show alongside the fallback. Non-Error throws are stringified rather than dropped. */
export function errorMessage(e: unknown): string {
  const raw = (e instanceof Error ? e.message : String(e)).trim();
  const message = raw.length > 0 ? raw : "Unknown error";
  return message.length > ERROR_MAX_LENGTH
    ? `${message.slice(0, ERROR_MAX_LENGTH)}…`
    : message;
}

/**
 * A catalog component that renders mermaid diagram source as a diagram.
 *
 * mermaid (~several MB) is dynamically imported to defer module evaluation until a view containing a
 * diagram is rendered (so the heavy mermaid init does not run at startup). Note that in single-binary
 * distribution Bun inlines it into the same chunk, so the bytes still land in the initial bundle
 * (there is no split-chunk delivery). Rendering is document-dependent and client-only, so before
 * SSR / mount the raw code is shown in a <pre> (content never disappears before the diagram appears,
 * and it stays here on parse failure too). dark/light follows useColorScheme.
 */
export function Mermaid({ code }: MermaidProps) {
  const scheme = useColorScheme();
  const id = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  // the parse message mermaid throws (line number + offending token). Doubles as the failure flag.
  const [error, setError] = useState<string | null>(null);
  const [zoomed, setZoomed] = useState(false);
  const [zoomSvg, setZoomSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // keep the previous svg until the re-render completes. The most frequent re-render is a theme
    // switch; clearing svg here would briefly drop to the <pre> fallback and flicker, so swap the diagram in place.
    setError(null);
    setZoomSvg(null);
    (async () => {
      try {
        const svg = await renderMermaid(code, `mermaid-${id}`, scheme);
        if (!cancelled) setSvg(svg);
      } catch (e) {
        if (!cancelled) {
          setSvg(null);
          setError(errorMessage(e));
          // the fallback branch unmounts the dialog; a stale open flag would make it
          // pop back open on its own when a later render recovers
          setZoomed(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, scheme, id]);

  // The dialog copy is re-rendered under its own render id: reusing the inline svg string would
  // duplicate its internal element ids (markers, clip paths), making url(#...) refs cross instances.
  useEffect(() => {
    if (!zoomed || zoomSvg !== null) return;
    let cancelled = false;
    (async () => {
      try {
        const svg = await renderMermaid(code, `mermaid-${id}-zoom`, scheme);
        if (!cancelled) setZoomSvg(svg);
      } catch {
        // the inline render already surfaced the failure; leave the dialog empty
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [zoomed, zoomSvg, code, scheme, id]);

  // mermaid pins the svg to its container via an inline max-width (natural diagram width).
  // For zoom, grow to the dialog width or the natural width, whichever is larger: small
  // diagrams fill the dialog, dense ones overflow-scroll at readable size instead of being
  // squeezed to the viewport.
  const zoomBodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const svgEl = zoomBodyRef.current?.querySelector("svg");
    if (!svgEl) return;
    const natural = svgEl.style.maxWidth;
    svgEl.style.maxWidth = "none";
    svgEl.style.width = natural ? `max(100%, ${natural})` : "100%";
  }, [zoomSvg, zoomed]);

  // the source stays readable either way; only the failed case adds a reason above it, so that an
  // unrendered diagram is distinguishable from one still loading and the author can see which line
  // mermaid choked on
  const source = (
    <pre className="overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm leading-6">
      {code}
    </pre>
  );

  if (error !== null) {
    return (
      <div data-slot="mermaid" data-state="error" className="my-4">
        <div
          data-slot="mermaid-error"
          className="mb-2 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground"
        >
          <p>{t.mermaid.renderFailed}</p>
          {/* mermaid points at the offending column with a caret line, so preserve
              whitespace and scroll rather than wrap (wrapping misaligns the caret) */}
          <pre className="mt-1 overflow-x-auto font-mono text-xs opacity-70">
            {error}
          </pre>
        </div>
        {source}
      </div>
    );
  }

  if (svg === null) {
    return (
      <div data-slot="mermaid" data-state="loading" className="my-4">
        {source}
      </div>
    );
  }

  return (
    <div
      data-slot="mermaid"
      data-state="ready"
      // the same card surface as Code, so diagrams and code read as one family
      className="relative my-4 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      {/* always visible: the diagram now scrolls inside the card, so zooming is the way to see a
          capped diagram whole — a control that only appears on hover hides that escape hatch.
          Inset far enough that it clears the scrollbar of the pane below it */}
      <button
        type="button"
        data-slot="mermaid-zoom"
        aria-label={t.mermaid.expand}
        onClick={() => setZoomed(true)}
        className="absolute right-4 top-2 z-10 flex size-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Maximize2 className="size-4" aria-hidden />
      </button>
      <div
        // cap the inline height so one tall diagram cannot push the rest of the view off screen;
        // overflow scrolls rather than shrinking, keeping labels readable (the zoom dialog shows the whole thing).
        // a fixed rem cap, not dvh: the viewport can be 0-height (headless / measuring embeds), which would
        // collapse the diagram to nothing
        className="flex max-h-[32rem] items-start justify-center overflow-auto p-4 [&_svg]:max-w-full [&_svg]:h-auto"
        // embed the SVG mermaid generates as-is (labels are already sanitized by the default securityLevel 'strict')
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <Dialog open={zoomed} onOpenChange={setZoomed}>
        <DialogContent className="h-[90dvh] p-4 sm:max-w-[calc(100%-2rem)]">
          <DialogTitle className="sr-only">{t.mermaid.expand}</DialogTitle>
          {zoomSvg !== null ? (
            <div
              ref={zoomBodyRef}
              data-slot="mermaid-zoom-body"
              className="h-full w-full overflow-auto [&_svg]:h-auto"
              dangerouslySetInnerHTML={{ __html: zoomSvg }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
