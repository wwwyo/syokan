import { useEffect, useId, useState } from "react";
import { useColorScheme } from "@/lib/useColorScheme";

type MermaidProps = {
  chart: string;
};

/**
 * ```mermaid フェンスを図として描画する MarkdownDoc 内部部品。
 *
 * mermaid (~数MB) は dynamic import し、図を含む doc を描画するまでモジュール評価を遅延する
 * (起動時に mermaid の重い初期化を走らせない)。ただし単体バイナリ配布では Bun が同一 chunk に
 * インライン化するため bytes 自体は初回 bundle に含まれる (chunk 分割配信はしない)。
 * 描画は document 依存の client 専用なので、SSR / mount 前は生のコードを <pre> で見せる
 * (図が出るまで内容が消えない / 解析失敗時もここに留まる)。dark/light は useColorScheme に追従する。
 */
export function Mermaid({ chart }: MermaidProps) {
  const scheme = useColorScheme();
  const id = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: scheme === "dark" ? "dark" : "default",
          // chart は外部 / LLM 由来。ラベル内 HTML を sanitize する (既定だが明示する)
          securityLevel: "strict",
        });
        const { svg } = await mermaid.render(`mermaid-${id}`, chart);
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
  }, [chart, scheme, id]);

  if (failed || svg === null) {
    return (
      <pre
        data-slot="mermaid"
        data-state={failed ? "error" : "loading"}
        className="my-4 overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm leading-6"
      >
        {chart}
      </pre>
    );
  }

  return (
    <div
      data-slot="mermaid"
      data-state="ready"
      className="my-4 flex justify-center overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
      // mermaid が生成する SVG をそのまま埋める (securityLevel 既定 'strict' でラベルは sanitize 済み)
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
