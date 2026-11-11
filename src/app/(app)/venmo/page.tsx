import { redirect } from "next/navigation";

// The Venmo report generator now lives under Reports → Bank Reports. Old links and bookmarks land there.
export default function VenmoPage() {
  redirect("/reports/bank?tab=venmo");
}
