import { useEffect, useState } from "react";
import { z } from "zod";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { formatDateTime } from "../../lib/date";
import { cn } from "../../lib/utils";
import { useNodeUiState, useSharedView } from "../../lib/viewState";
import {
  type ProbeCheck,
  type ProbeResult,
  probeCheckSchema,
  probeResultSchema,
} from "./check";

export const probePropsSchema = z
  .object({
    label: z.string().min(1).optional(),
    check: probeCheckSchema,
    // what the producer measured at generation time; reruns override it in device-local
    // UI state (the snapshot itself stays immutable)
    result: probeResultSchema.optional(),
    // whether check args and results may be shown on the public share viewer.
    // Default hidden: they can contain local paths not meant to be published.
    shareVisible: z.boolean().optional(),
  })
  .strict();

export type ProbeProps = z.infer<typeof probePropsSchema>;

// what the component actually receives: published envelopes strip check/result at
// publish time unless shareVisible (server/materialize.ts), so check can be absent
// even though producers must always send it.
type ProbeComponentProps = Omit<ProbeProps, "check"> & { check?: ProbeCheck };

function describeCheck(check: ProbeCheck): string {
  switch (check.kind) {
    case "diff_clean":
      return `diff_clean: ${check.paths.join(", ")} vs ${check.base} (${check.repo})`;
    case "search_count": {
      const op = { eq: "==", max: "<=", min: ">=" }[check.op ?? "eq"];
      return `search_count: "${check.pattern}" in ${check.path} ${op} ${check.expected}`;
    }
    case "file_exists":
      return `file_exists: ${check.path}${check.expected === false ? " (must not exist)" : ""}`;
  }
}

const statusStyles = {
  pass: "border-transparent bg-emerald-600/15 text-emerald-700 dark:text-emerald-300",
  fail: "border-transparent bg-red-600/15 text-red-700 dark:text-red-300",
  error: "border-transparent bg-amber-600/15 text-amber-700 dark:text-amber-300",
} as const;

/**
 * A predefined read-only check with its latest outcome, re-runnable from the view.
 * This turns "no findings" from a generation-time self-report into a result the reader
 * can re-measure (the false-green countermeasure). Kinds and args are fixed by the
 * schema (check.ts) — no arbitrary shell. diff_clean results go stale when repo HEAD
 * moves past the run.
 */
export function Probe({ label, check, result, shareVisible }: ProbeComponentProps) {
  const shared = useSharedView();
  const [rerunResult, setRerunResult] = useNodeUiState<ProbeResult | null>(
    "probe",
    null,
  );
  const [running, setRunning] = useState(false);
  const [headCommit, setHeadCommit] = useState<string | null>(null);
  const latest = rerunResult ?? result;

  // stale = target ref moved past the last run. Only diff_clean defines a target ref.
  const repo = check?.kind === "diff_clean" ? check.repo : null;
  const resultCommit = latest?.ref?.commit ?? null;
  useEffect(() => {
    if (shared || repo === null || resultCommit === null) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/probes/ref", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ repo }),
        });
        if (!res.ok) return;
        const body = (await res.json()) as { commit?: string };
        if (!cancelled && typeof body.commit === "string") {
          setHeadCommit(body.commit);
        }
      } catch {
        // stale detection is best-effort; the result itself stays shown
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shared, repo, resultCommit]);
  const stale =
    resultCommit !== null && headCommit !== null && headCommit !== resultCommit;

  const rerun = async () => {
    if (check === undefined) return;
    setRunning(true);
    try {
      const res = await fetch("/api/probes/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ check }),
      });
      if (!res.ok) {
        setRerunResult({
          status: "error",
          detail: `run failed (HTTP ${res.status})`,
          ranAt: new Date().toISOString(),
        });
        return;
      }
      const next = (await res.json()) as ProbeResult;
      setRerunResult(next);
      if (next.ref?.commit !== undefined) setHeadCommit(next.ref.commit);
    } catch {
      setRerunResult({
        status: "error",
        detail: "run failed (network)",
        ranAt: new Date().toISOString(),
      });
    } finally {
      setRunning(false);
    }
  };

  const hiddenOnShare = (shared && shareVisible !== true) || check === undefined;
  return (
    <div
      data-slot="probe"
      className="flex flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5 text-sm"
    >
      <div className="flex flex-wrap items-center gap-2">
        {latest !== undefined && !hiddenOnShare ? (
          <span
            data-slot="probe-status"
            className={cn(
              "rounded-full border px-2 py-0.5 text-xs font-medium",
              statusStyles[latest.status],
            )}
          >
            {latest.status}
          </span>
        ) : (
          <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
            not run
          </span>
        )}
        <span className="font-medium">{label ?? check?.kind ?? "probe"}</span>
        {stale && !hiddenOnShare && (
          <Badge variant="outline" data-slot="probe-stale">
            stale
          </Badge>
        )}
        {!shared && (
          <Button
            data-slot="probe-rerun"
            variant="outline"
            size="sm"
            className="ml-auto h-7 px-2 text-xs"
            disabled={running}
            onClick={rerun}
          >
            {running ? "running…" : "re-run"}
          </Button>
        )}
        {shared && (
          <span className="ml-auto text-xs text-muted-foreground">
            re-run is disabled on shared views
          </span>
        )}
      </div>
      {hiddenOnShare ? (
        <p className="text-xs text-muted-foreground">
          check details are hidden on shared views
        </p>
      ) : (
        <>
          {/* what would run is always inspectable — the reader never re-runs a black box */}
          {check !== undefined && (
            <p
              data-slot="probe-check"
              className="break-all font-mono text-xs text-muted-foreground"
            >
              {describeCheck(check)}
            </p>
          )}
          {latest?.detail !== undefined && (
            <p data-slot="probe-detail" className="text-xs text-muted-foreground">
              {latest.detail}
            </p>
          )}
          {latest !== undefined && (
            <p className="text-xs text-muted-foreground/70">
              {`last run ${formatDateTime(latest.ranAt)}`}
              {stale && " — HEAD has moved since"}
            </p>
          )}
        </>
      )}
    </div>
  );
}
