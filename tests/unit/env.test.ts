import { afterEach, describe, expect, it } from "vitest";
import { publicEnv } from "@/lib/env";

const saved = { ...process.env };
afterEach(() => { process.env = { ...saved }; });

function withAppUrl(url: string) {
  process.env.NEXT_PUBLIC_APP_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "x".repeat(30);
  return publicEnv().NEXT_PUBLIC_APP_URL;
}

describe("publicEnv().NEXT_PUBLIC_APP_URL", () => {
  it("leaves a clean URL alone", () => {
    expect(withAppUrl("https://brillapro.netlify.app")).toBe("https://brillapro.netlify.app");
  });
  it("drops trailing slashes so links never contain '//'", () => {
    expect(withAppUrl("https://brillapro.netlify.app/")).toBe("https://brillapro.netlify.app");
    expect(withAppUrl("https://brillapro.netlify.app///")).toBe("https://brillapro.netlify.app");
    expect(`${withAppUrl("https://brillapro.netlify.app/")}/request/abc`).toBe("https://brillapro.netlify.app/request/abc");
  });
});
