/**
 * Discover Solana wallets via Wallet Standard, with Phantom/Solflare legacy fallback.
 * Connect + signMessage only. Never signTransaction / sendTransaction.
 */

const WALLET_STANDARD_REGISTER = "wallet-standard:register-wallet";
const WALLET_STANDARD_READY = "wallet-standard:app-ready";
const STANDARD_CONNECT = "standard:connect";
const SOLANA_SIGN_MESSAGE = "solana:signMessage";

export interface DiscoveredWallet {
  id: string;
  name: string;
  icon?: string;
  kind: "standard" | "legacy";
  standardWallet?: StandardWalletLike;
  legacyProvider?: LegacySolanaProvider;
}

export interface ConnectedWallet {
  id: string;
  name: string;
  address: string;
  publicKey: Uint8Array;
  kind: "standard" | "legacy";
  account?: StandardAccountLike;
  standardWallet?: StandardWalletLike;
  legacyProvider?: LegacySolanaProvider;
}

interface StandardAccountLike {
  address: string;
  publicKey: Uint8Array;
}

interface StandardWalletLike {
  name: string;
  icon?: string;
  accounts: StandardAccountLike[];
  features: Record<string, unknown>;
  chains?: string[];
}

interface LegacySolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: { toBytes(): Uint8Array; toBase58(): string };
  connect(): Promise<{ publicKey?: { toBytes(): Uint8Array; toBase58(): string } }>;
  signMessage(
    message: Uint8Array,
    encoding?: string
  ): Promise<{ signature: Uint8Array } | Uint8Array>;
}

interface LegacyWindow {
  solana?: LegacySolanaProvider;
  phantom?: { solana?: LegacySolanaProvider };
  solflare?: LegacySolanaProvider;
}

function hasSignMessage(wallet: StandardWalletLike): boolean {
  const feature = wallet.features && wallet.features[SOLANA_SIGN_MESSAGE];
  const connect = wallet.features && wallet.features[STANDARD_CONNECT];
  return Boolean(feature) && Boolean(connect);
}

function isSolanaWallet(wallet: StandardWalletLike): boolean {
  const chains = Array.isArray(wallet.chains) ? wallet.chains : [];
  if (chains.some((chain) => typeof chain === "string" && chain.startsWith("solana:"))) {
    return true;
  }
  return hasSignMessage(wallet);
}

export function createWalletRegistry(): {
  list: () => DiscoveredWallet[];
} {
  const standard = new Map<string, StandardWalletLike>();

  function register(wallet: StandardWalletLike): void {
    if (!wallet || typeof wallet.name !== "string") {
      return;
    }
    if (!isSolanaWallet(wallet) || !hasSignMessage(wallet)) {
      return;
    }
    standard.set(wallet.name, wallet);
  }

  if (typeof window !== "undefined") {
    window.addEventListener(WALLET_STANDARD_REGISTER, ((event: Event) => {
      const detail = (event as CustomEvent<(api: { register: typeof register }) => void>)
        .detail;
      if (typeof detail === "function") {
        detail({ register });
      }
    }) as EventListener);

    try {
      window.dispatchEvent(new Event(WALLET_STANDARD_READY));
    } catch {
      // ignore
    }
  }

  return {
    list() {
      const wallets: DiscoveredWallet[] = [];
      const names = new Set<string>();

      for (const wallet of standard.values()) {
        names.add(wallet.name.toLowerCase());
        wallets.push({
          id: `standard:${wallet.name}`,
          name: wallet.name,
          icon: wallet.icon,
          kind: "standard",
          standardWallet: wallet,
        });
      }

      if (typeof window !== "undefined") {
        const w = window as unknown as LegacyWindow;
        const phantom = w.phantom?.solana || (w.solana?.isPhantom ? w.solana : undefined);
        const solflare = w.solflare;

        if (phantom && !names.has("phantom")) {
          wallets.push({
            id: "legacy:phantom",
            name: "Phantom",
            kind: "legacy",
            legacyProvider: phantom,
          });
        }
        if (solflare && !names.has("solflare")) {
          wallets.push({
            id: "legacy:solflare",
            name: "Solflare",
            kind: "legacy",
            legacyProvider: solflare,
          });
        }
      }

      return wallets;
    },
  };
}

function bytesToAddress(bytes: Uint8Array): string {
  const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const source = Array.from(bytes);
  let zeros = 0;
  while (zeros < source.length && source[zeros] === 0) {
    zeros += 1;
  }
  const size = Math.floor(((source.length - zeros) * 138) / 100) + 1;
  const b58 = new Uint8Array(size);
  let length = 0;
  for (let i = zeros; i < source.length; i += 1) {
    let carry = source[i];
    let j = 0;
    for (let k = size - 1; k >= 0 && (carry !== 0 || j < length); k -= 1, j += 1) {
      carry += 256 * b58[k];
      b58[k] = carry % 58;
      carry = (carry / 58) | 0;
    }
    length = j;
  }
  let start = size - length;
  while (start < size && b58[start] === 0) {
    start += 1;
  }
  let result = "1".repeat(zeros);
  for (let i = start; i < size; i += 1) {
    result += ALPHABET[b58[i]];
  }
  return result;
}

export async function connectDiscoveredWallet(
  wallet: DiscoveredWallet
): Promise<ConnectedWallet> {
  if (wallet.kind === "standard" && wallet.standardWallet) {
    const connectFeature = wallet.standardWallet.features[STANDARD_CONNECT] as {
      connect: (input?: { silent?: boolean }) => Promise<{ accounts: StandardAccountLike[] }>;
    };
    const result = await connectFeature.connect();
    const account =
      (result && result.accounts && result.accounts[0]) ||
      wallet.standardWallet.accounts[0];
    if (!account || !account.publicKey) {
      throw new Error("Wallet did not return an account.");
    }
    const publicKey =
      account.publicKey instanceof Uint8Array
        ? account.publicKey
        : new Uint8Array(account.publicKey);
    const address = account.address || bytesToAddress(publicKey);
    return {
      id: wallet.id,
      name: wallet.name,
      address,
      publicKey,
      kind: "standard",
      account,
      standardWallet: wallet.standardWallet,
    };
  }

  if (!wallet.legacyProvider) {
    throw new Error("Wallet is unavailable.");
  }
  const connected = await wallet.legacyProvider.connect();
  const key = connected.publicKey || wallet.legacyProvider.publicKey;
  if (!key) {
    throw new Error("Wallet did not return a public key.");
  }
  const publicKey = key.toBytes();
  const address = typeof key.toBase58 === "function" ? key.toBase58() : bytesToAddress(publicKey);
  return {
    id: wallet.id,
    name: wallet.name,
    address,
    publicKey,
    kind: "legacy",
    legacyProvider: wallet.legacyProvider,
  };
}

export async function signMessageWithWallet(
  wallet: ConnectedWallet,
  message: string
): Promise<Uint8Array> {
  const bytes = new TextEncoder().encode(message);

  if (wallet.kind === "standard" && wallet.standardWallet && wallet.account) {
    const feature = wallet.standardWallet.features[SOLANA_SIGN_MESSAGE] as {
      signMessage: (input: {
        account: StandardAccountLike;
        message: Uint8Array;
      }) => Promise<Array<{ signature: Uint8Array }>>;
    };
    const [out] = await feature.signMessage({
      account: wallet.account,
      message: bytes,
    });
    if (!out || !out.signature) {
      throw new Error("Wallet did not return a signature.");
    }
    return out.signature instanceof Uint8Array
      ? out.signature
      : new Uint8Array(out.signature);
  }

  if (!wallet.legacyProvider) {
    throw new Error("Wallet is unavailable.");
  }
  const signed = await wallet.legacyProvider.signMessage(bytes, "utf8");
  const signature =
    signed instanceof Uint8Array
      ? signed
      : signed && signed.signature
        ? signed.signature
        : null;
  if (!signature) {
    throw new Error("Wallet did not return a signature.");
  }
  return signature instanceof Uint8Array ? signature : new Uint8Array(signature);
}
