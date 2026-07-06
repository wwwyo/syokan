import { useEffect, useId, useState } from "react";
import { z } from "zod";
import { useColorScheme } from "../../lib/useColorScheme";

export const mermaidPropsSchema = z
  .object({
    // mermaid diagram source (e.g. "graph TD; A-->B")
    code: z.string().min(1),
  })
  .strict();

export type MermaidProps = z.infer<typeof mermaidPropsSchema>;

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

  useEffect(() => {
    let cancelled = false;
    // keep the previous svg until the re-render completes. The most frequent re-render is a theme
    // switch; clearing svg here would briefly drop to the <pre> fallback and flicker, so swap the diagram in place.
    setFailed(false);
    (async () => {
      try {
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
        const { svg } = await mermaid.render(`mermaid-${id}`, code);
        if (!cancelled) setSvg(svg);
      } catch {
        if (!cancelled) {
          setSvg(null);
          setFailed(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, scheme, id]);

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
      className="my-4 flex justify-center overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
      // embed the SVG mermaid generates as-is (labels are already sanitized by the default securityLevel 'strict')
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
