/** Link that opens an address in Google Maps (a plain search link: no API key, no account, nothing is sent from our servers). */
export function mapsUrl(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
