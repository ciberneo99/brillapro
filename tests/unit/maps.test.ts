import { describe, expect, it } from "vitest";
import { mapsUrl } from "@/lib/maps";

describe("mapsUrl", () => {
  it("builds a Google Maps search link with the address encoded", () => {
    const u = new URL(mapsUrl("7302 Plant Street, Austin, TX 78745"));
    expect(u.origin + u.pathname).toBe("https://www.google.com/maps/search/");
    expect(u.searchParams.get("api")).toBe("1");
    expect(u.searchParams.get("query")).toBe("7302 Plant Street, Austin, TX 78745");
  });

  it("cannot inject extra parameters or markup through the address", () => {
    const u = new URL(mapsUrl("1 Main St&api=2#x <script>"));
    expect(u.searchParams.get("api")).toBe("1");
    expect(u.searchParams.get("query")).toBe("1 Main St&api=2#x <script>");
  });
});
