import { getRouteApi } from "@tanstack/react-router";

// Reads the snapshot list returned by the loader of the pathless layout route "_shell" (router.tsx).
// Referencing by id instead of importing the route object avoids a circular import with router.tsx.
export const shellRouteApi = getRouteApi("/_shell");
