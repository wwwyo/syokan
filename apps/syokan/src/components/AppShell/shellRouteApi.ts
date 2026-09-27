import { getRouteApi } from "@tanstack/react-router";

// Route handles for the pathless layout "_shell" and the view route under it
// (router.tsx). Referencing by getRouteApi instead of importing the route objects
// avoids a circular import with router.tsx, and the registered-id constraint means
// a route rename fails compile instead of silently no-oping invalidation filters.
export const shellRouteApi = getRouteApi("/_shell");
export const viewRouteApi = getRouteApi("/_shell/snapshots/$id");
