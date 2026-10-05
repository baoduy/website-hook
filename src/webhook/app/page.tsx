import { notFound } from "next/navigation";
import { Inspector } from "@/components/inspector/inspector";

// A static "/" reserves no webhook path — the [id] route still claims every single-segment path.
// WEBSITE_HOOK_ROLE is inlined at build time (next.config.ts): the API image serves no UI pages.
export default function Page() {
  if (process.env.WEBSITE_HOOK_ROLE === "api") notFound();
  return <Inspector />;
}
