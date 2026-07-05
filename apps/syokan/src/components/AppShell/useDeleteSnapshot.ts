import { useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { t } from "@/lib/i18n";
import { deleteSnapshot, nextSnapshotId } from "@/lib/snapshots";
import type { SnapshotSummary } from "@/schema";
import { shellRouteApi } from "./shellRouteApi";

export type DeleteOptions = {
  // Whether the deletion target is the snapshot currently on display. If true, navigate to a
  // neighbor (next → previous) or home after deletion.
  isCurrent: boolean;
};

// Imperatively read the latest list after invalidate (useLoaderData is a hook and can't be
// called from a callback). _shell is the ancestor of every route, so it is always in matches.
function shellItems(router: ReturnType<typeof useRouter>): SnapshotSummary[] {
  const match = router.state.matches.find((m) => m.routeId === "/_shell");
  return (match?.loaderData ?? []) as SnapshotSummary[];
}

/**
 * The single flow for deleting a snapshot. Used from both ViewHeader (the one on display) and
 * the sidebar (any row). Handles delete → invalidate the shell loader (refresh the sidebar) →
 * (if on display) navigate, as one coherent sequence.
 */
export function useDeleteSnapshot() {
  const router = useRouter();
  const before = shellRouteApi.useLoaderData();

  return useCallback(
    async (id: string, { isCurrent }: DeleteOptions) => {
      // Decide the navigation target from the pre-deletion ordering (the adjacent position is lost after deletion).
      const next = nextSnapshotId(before, id);
      if (!(await deleteSnapshot(id))) {
        if (typeof window !== "undefined") window.alert(t.view.deleteFailed);
        return;
      }
      // Re-run only the shell loader to refresh the sidebar. Do not re-fetch the envelope on
      // display (avoids momentarily falling to not-found when viewing the deleted target). The
      // link to the gone snapshot disappears from the list, and a back navigation re-runs the
      // loader with staleTime=0 and surfaces a 404.
      await router.invalidate({ filter: (m) => m.routeId === "/_shell" });
      if (isCurrent) {
        // Open the computed target only if it still exists in the post-deletion list. Otherwise go home.
        const after = shellItems(router);
        const target = next && after.some((i) => i.id === next) ? next : null;
        await router.navigate(
          target ? { to: "/snapshots/$id", params: { id: target } } : { to: "/" },
        );
      }
    },
    [router, before],
  );
}
