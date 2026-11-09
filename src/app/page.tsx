import { redirect } from "next/navigation";

// The public landing page arrives in Phase 9. Until then, send visitors to the app.
export default function Home() {
  redirect("/dashboard");
}
