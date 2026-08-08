import { Inspector } from "@/components/inspector/inspector";

// A static "/" reserves no webhook path — the [id] route still claims every single-segment path.
export default function Page() {
  return <Inspector />;
}
