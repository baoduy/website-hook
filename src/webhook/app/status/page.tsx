import { notFound } from "next/navigation";
import { StatusDashboard } from "@/components/status/status-dashboard";

// WEBSITE_HOOK_ROLE is inlined at build time (next.config.ts): the API image serves no UI pages.
export default function StatusPage() {
  if (process.env.WEBSITE_HOOK_ROLE === "api") notFound();
  return <StatusDashboard />;
}
