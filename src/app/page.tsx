import { mocksEnabled } from "@/orchestrator/mode";
import { Dashboard } from "./dashboard";

// Read USE_MOCKS per request so the badge matches the server, not the build.
export const dynamic = "force-dynamic";

export default function Page() {
  return <Dashboard mocks={mocksEnabled()} />;
}
