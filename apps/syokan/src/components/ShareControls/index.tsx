import { Check, Copy, Loader2, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateTime } from "@/lib/date";
import { t } from "@/lib/i18n";
import type {
  CreateShareResponse,
  ListSharesResponse,
} from "../../../../share/types";

/** The publish response as-is. The list (ShareSummary) is a superset, so it is assignable to this type. */
export type ShareEntry = CreateShareResponse;

export type PublishResult =
  | { kind: "success"; share: ShareEntry }
  | { kind: "not_logged_in" }
  | { kind: "error"; message: string };

/** Publishes. Every outcome is folded into a PublishResult for the dialog (never throws). */
export async function publishSnapshot(id: string): Promise<PublishResult> {
  try {
    const res = await fetch(
      `/api/snapshots/${encodeURIComponent(id)}/publish`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
    );
    if (res.ok) {
      const share = (await res.json()) as CreateShareResponse;
      return { kind: "success", share };
    }
    if (res.status === 401) return { kind: "not_logged_in" };
    let body: { error?: string; path?: string } | null = null;
    try {
      body = (await res.json()) as { error?: string; path?: string };
    } catch {
      body = null;
    }
    if (body?.error === "materialize_failed") {
      return {
        kind: "error",
        message: t.share.errors.materializeFailed(body.path ?? ""),
      };
    }
    if (body?.error === "share_api_unreachable" || res.status === 502) {
      return { kind: "error", message: t.share.errors.unreachable };
    }
    return { kind: "error", message: t.share.errors.generic };
  } catch {
    return { kind: "error", message: t.share.errors.network };
  }
}

export async function fetchShares(snapshotId: string): Promise<ShareEntry[]> {
  try {
    const res = await fetch(
      `/api/shares?snapshot=${encodeURIComponent(snapshotId)}`,
    );
    if (!res.ok) return [];
    const data = (await res.json()) as ListSharesResponse;
    // A 200 doesn't guarantee shares is an array (e.g. a proxy passing through the Worker's non-JSON).
    // Putting undefined into state would crash the whole ViewHeader on the chip's shares.length.
    return Array.isArray(data?.shares) ? data.shares : [];
  } catch {
    return [];
  }
}

export async function unpublishShare(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/shares/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function shareDialogTitle(result: PublishResult): string {
  if (result.kind === "success") return t.share.successTitle;
  if (result.kind === "not_logged_in") return t.share.loginTitle;
  return t.share.errorTitle;
}

function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Where clipboard is unavailable (e.g. non-secure context), give up on copying
    }
  };

  return (
    <Button
      data-slot="share-copy"
      size="xs"
      variant="outline"
      aria-label={copied ? t.common.copied : t.share.copyUrl}
      onClick={() => void onCopy()}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? t.common.copied : t.common.copy}
    </Button>
  );
}

/** The presentational part of the publish result (the dialog's contents). Storybook / tests render this directly. */
export function ShareDialogBody({ result }: { result: PublishResult }) {
  if (result.kind === "success") {
    return (
      <div data-slot="share-dialog-success" className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-xs">
            {result.share.url}
          </code>
          <CopyUrlButton url={result.share.url} />
        </div>
        <p className="text-xs text-muted-foreground">
          {t.share.expires(formatDateTime(result.share.expiresAt))}
        </p>
      </div>
    );
  }
  if (result.kind === "not_logged_in") {
    return (
      <p data-slot="share-dialog-login" className="text-sm text-muted-foreground">
        {t.share.loginBefore}
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">
          syokan login
        </code>
        {t.share.loginAfter}
      </p>
    );
  }
  return (
    <p data-slot="share-dialog-error" className="text-sm text-destructive">
      {result.message}
    </p>
  );
}

/** The presentational part of the active-shares list (the chip popover's contents). */
export function ShareList({
  shares,
  onUnpublish,
}: {
  shares: ShareEntry[];
  onUnpublish: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-muted-foreground">
        {t.share.activeShares}
      </p>
      <ul data-slot="share-list" className="flex flex-col gap-3">
        {shares.map((share) => (
          <li
            key={share.id}
            data-slot="share-list-item"
            className="flex flex-col gap-1.5"
          >
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 font-mono text-xs">
                {share.url}
              </code>
              <CopyUrlButton url={share.url} />
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {t.share.expires(formatDateTime(share.expiresAt))}
              </span>
              <Button
                data-slot="share-unpublish"
                size="xs"
                variant="destructive"
                onClick={() => onUnpublish(share.id)}
              >
                {t.share.unpublish}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type ShareControlsProps = {
  snapshotId: string;
  /** For Storybook / tests: reproduce the active-shares state without a server (when set, suppresses the mount fetch) */
  initialShares?: ShareEntry[];
  /** For Storybook: start with the dialog open */
  initialDialog?: PublishResult;
};

/**
 * KV is the SSOT for publish state. Nothing is persisted locally; it's derived from GET /api/shares on every mount.
 */
export function ShareControls({
  snapshotId,
  initialShares,
  initialDialog,
}: ShareControlsProps) {
  const [shares, setShares] = useState<ShareEntry[]>(initialShares ?? []);
  const [dialog, setDialog] = useState<PublishResult | null>(
    initialDialog ?? null,
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialShares !== undefined) return;
    let active = true;
    void fetchShares(snapshotId).then((fetched) => {
      if (active) setShares(fetched);
    });
    return () => {
      active = false;
    };
  }, [snapshotId, initialShares]);

  const onShare = async () => {
    setBusy(true);
    const result = await publishSnapshot(snapshotId);
    setBusy(false);
    if (result.kind === "success") {
      setShares((prev) => [result.share, ...prev]);
    }
    setDialog(result);
  };

  const onUnpublish = async (id: string) => {
    const ok = await unpublishShare(id);
    if (ok) setShares((prev) => prev.filter((s) => s.id !== id));
  };

  return (
    <div data-slot="share-controls" className="flex items-center gap-2">
      {shares.length > 0 ? (
        <Popover>
          <PopoverTrigger
            data-slot="share-chip"
            className="flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="size-1.5 rounded-full bg-primary" aria-hidden />
            {t.share.shared}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <ShareList shares={shares} onUnpublish={(id) => void onUnpublish(id)} />
          </PopoverContent>
        </Popover>
      ) : null}
      <Button
        data-slot="share-button"
        size="sm"
        variant="ghost"
        className="text-muted-foreground hover:text-foreground"
        disabled={busy}
        onClick={() => void onShare()}
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Share2 aria-hidden />}
        {busy ? t.share.sharing : t.share.share}
      </Button>
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          {dialog ? (
            <>
              <DialogHeader>
                <DialogTitle>{shareDialogTitle(dialog)}</DialogTitle>
              </DialogHeader>
              <ShareDialogBody result={dialog} />
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
