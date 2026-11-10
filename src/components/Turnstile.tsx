import Script from "next/script";

/** Cloudflare Turnstile widget. Renders nothing until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set; the widget
 *  adds a hidden `cf-turnstile-response` field to the surrounding form, which the server verifies. */
export function Turnstile() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      <div className="cf-turnstile" data-sitekey={siteKey} />
    </>
  );
}
