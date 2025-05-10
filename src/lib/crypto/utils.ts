/**
 * Converts satoshis to BTC (1 BTC = 100,000,000 sats)
 * @param sats - A number representing satoshis
 * @returns number representing BTC (e.g. 100000000 -> 1.0)
 */
export function satsToBTC(sats: number): number {
  if (!Number.isFinite(sats)) throw new Error("Invalid satoshi input");
  return sats / 100_000_000;
}

/**
 * Converts BTC to satoshis (e.g. 1.23 → 123000000)
 * @param btc - A number representing BTC
 * @returns number representing satoshis
 */
export function btcToSats(btc: number): number {
  if (!Number.isFinite(btc)) throw new Error("Invalid BTC input");

  // Convert to string, split at decimal
  const [intPart, decimalPart = ""] = btc.toString().split(".");

  // Pad decimal to 8 digits (sats)
  const decimalPadded = (decimalPart + "00000000").slice(0, 8);

  const satsStr = intPart + decimalPadded;
  const sats = BigInt(satsStr);

  if (sats > Number.MAX_SAFE_INTEGER) {
    throw new Error("Resulting satoshi value exceeds JS safe integer range");
  }

  return Number(sats);
}
