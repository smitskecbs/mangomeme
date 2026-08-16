/**
 * Shorten a Solana address for display, e.g. 7Abc...9XYZ
 */
export function shortenWallet(address: string): string {
  const trimmed = address.trim();
  if (trimmed.length <= 8) {
    return trimmed;
  }
  return `${trimmed.slice(0, 4)}...${trimmed.slice(-4)}`;
}
