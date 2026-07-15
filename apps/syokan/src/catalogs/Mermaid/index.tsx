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
  const [failed, setFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [zoomSvg, setZoomSvg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // keep the previous svg until the re-render completes. The most frequent re-render is a theme
    // switch; clearing svg here would briefly drop to the <pre> fallback and flicker, so swap the diagram in place.
    setFailed(false);
    setZoomSvg(null);
    (async () => {
      try {
        const svg = await renderMermaid(code, `mermaid-${id}`, scheme);
        if (!cancelled) setSvg(svg);
      } catch {
        if (!cancelled) {
          setSvg(null);
          setFailed(true);
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

  if (failed || svg === null) {
    return (
      <pre
        data-slot="mermaid"
        data-state={failed ? "error" : "loading"}
        className="my-4 overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm leading-6"
      >
        {code}
      </pre>
    );
  }

  return (
    <div
      data-slot="mermaid"
      data-state="ready"
      // the same card surface as Code, so diagrams and code read as one family
      className="group relative my-4 overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
    >
      {/* hidden while not hovered — also drop pointer events so the invisible button never
          hijacks taps; on coarse pointers (no hover) it stays visible instead */}
      <button
        type="button"
        data-slot="mermaid-zoom"
        aria-label={t.mermaid.expand}
        onClick={() => setZoomed(true)}
        className="pointer-events-none absolute right-2 top-2 z-10 flex size-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-muted hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:pointer-events-auto group-hover:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100"
      >
        <Maximize2 className="size-4" aria-hidden />
      </button>
      <div
        className="flex justify-center overflow-x-auto p-4 [&_svg]:max-w-full [&_svg]:h-auto"
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
