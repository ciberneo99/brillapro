import { redirect } from "next/navigation";

// The Venmo report generator now lives at the bottom of Reports. Old links and bookmarks land there.
export default function VenmoPage() {
  redirect("/reports#venmo");
}
