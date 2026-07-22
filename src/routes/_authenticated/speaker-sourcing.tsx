import { createFileRoute, Navigate } from "@tanstack/react-router";

// Legacy route - Speaker Prospecting merged into /speakers.
// Kept as a redirect so old bookmarks still land on the right place.
export const Route = createFileRoute("/_authenticated/speaker-sourcing")({
  component: () => <Navigate to="/speakers" search={{ mode: "discover" }} replace />,
});
