/**
 * Discover Solana wallets via Wallet Standard, with official legacy fallbacks.
 * Connect + signMessage only. Never signTransaction / sendTransaction.
 *
 * Wallet Standard handshake (https://github.com/wallet-standard/wallet-standard):
 * - App listens for `wallet-standard:register-wallet` and calls detail({ register }).
 * - App dispatches `wallet-standard:app-ready` WITH { register } in event.detail
 *   so wallets that injected first can register.
 * - App may also drain deprecated navigator.wallets callbacks.
 *
 * Legacy injected providers (only if connect + signMessage exist):
 * - Phantom: window.phantom.solana / window.solana.isPhantom
 * - Solflare: window.solflare
 * - Backpack: window.backpack (official adapter) or window.solana.isBackpack
 *   https://www.npmjs.com/package/@solana/wallet-adapter-backpack
 *   Backpack in-app docs also show window.solana.signMessage:
 *   https://docs.backpack.app/deeplinks/limitations.md
 */

export const WALLET_STANDARD_REGISTER = "wallet-standard:register-wallet";
export const WALLET_STANDARD_READY = "wallet-standard:app-ready";
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

export interface LegacySolanaProvider {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isBackpack?: boolean;
  publicKey?: { toBytes(): Uint8Array; toBase58(): string };
  connect(): Promise<{ publicKey?: { toBytes(): Uint8Array; toBase58(): string } } | void>;
  signMessage(
    message: Uint8Array,
    extra?: string | { toBytes(): Uint8Array; toBase58(): string }
  ): Promise<{ signature: Uint8Array } | Uint8Array>;
}

export interface WalletDiscoveryTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
  dispatchEvent(event: Event): boolean;
  solana?: LegacySolanaProvider;
  phantom?: { solana?: LegacySolanaProvider };
  solflare?: LegacySolanaProvider;
  backpack?: LegacySolanaProvider;
  navigator?: { wallets?: unknown };
}

export interface WalletRegistryOptions {
  target?: WalletDiscoveryTarget;
  onChange?: () => void;
}

export interface WalletRegistry {
  list: () => DiscoveredWallet[];
  destroy: () => void;
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

export function isUsableLegacyProvider(provider: unknown): provider is LegacySolanaProvider {
  if (!provider || typeof provider !== "object") {
    return false;
  }
  const candidate = provider as LegacySolanaProvider;
  return typeof candidate.connect === "function" && typeof candidate.signMessage === "function";
}

function summarizeDiscovery(wallets: DiscoveredWallet[]): {
  count: number;
  names: string[];
  kinds: Array<DiscoveredWallet["kind"]>;
} {
  return {
    count: wallets.length,
    names: wallets.map((wallet) => wallet.name),
    kinds: wallets.map((wallet) => wallet.kind),
  };
}

function listLegacyProviders(target: WalletDiscoveryTarget): DiscoveredWallet[] {
  const wallets: DiscoveredWallet[] = [];
  const names = new Set<string>();

  function addLegacy(id: string, name: string, provider: LegacySolanaProvider | undefined): void {
    const key = name.toLowerCase();
    if (!provider || names.has(key) || !isUsableLegacyProvider(provider)) {
      return;
    }
    names.add(key);
    wallets.push({
      id,
      name,
      kind: "legacy",
      legacyProvider: provider,
    });
  }

  const backpack =
    (isUsableLegacyProvider(target.backpack) ? target.backpack : undefined) ||
    (target.solana?.isBackpack && isUsableLegacyProvider(target.solana)
      ? target.solana
      : undefined);
  addLegacy("legacy:backpack", "Backpack", backpack);

  const phantom =
    (isUsableLegacyProvider(target.phantom?.solana) ? target.phantom?.solana : undefined) ||
    (target.solana?.isPhantom && isUsableLegacyProvider(target.solana)
      ? target.solana
      : undefined);
  addLegacy("legacy:phantom", "Phantom", phantom);

  addLegacy(
    "legacy:solflare",
    "Solflare",
    isUsableLegacyProvider(target.solflare) ? target.solflare : undefined
  );

  return wallets;
}

function drainDeprecatedNavigatorWallets(
  target: WalletDiscoveryTarget,
  register: (wallet: StandardWalletLike) => void
): void {
  const pending = target.navigator?.wallets;
  if (!Array.isArray(pending)) {
    return;
  }
  for (const callback of pending) {
    if (typeof callback === "function") {
      try {
        callback({ register });
      } catch {
        // ignore a single bad deprecated callback
      }
    }
  }
}

export function createWalletRegistry(options: WalletRegistryOptions = {}): WalletRegistry {
  const standard = new Map<string, StandardWalletLike>();
  const target =
    options.target ||
    (typeof window !== "undefined" ? (window as unknown as WalletDiscoveryTarget) : undefined);
  let notify = false;

  function emitChange(): void {
    if (notify && options.onChange) {
      options.onChange();
    }
  }

  function register(wallet: StandardWalletLike): void {
    if (!wallet || typeof wallet.name !== "string") {
      return;
    }
    if (!isSolanaWallet(wallet) || !hasSignMessage(wallet)) {
      return;
    }
    const previous = standard.get(wallet.name);
    standard.set(wallet.name, wallet);
    if (previous !== wallet) {
      emitChange();
    }
  }

  const onRegisterWallet = ((event: Event) => {
    const detail = (event as CustomEvent<(api: { register: typeof register }) => void>).detail;
    if (typeof detail === "function") {
      detail({ register });
    }
  }) as EventListener;

  if (target) {
    target.addEventListener(WALLET_STANDARD_REGISTER, onRegisterWallet);
    drainDeprecatedNavigatorWallets(target, register);
    try {
      target.dispatchEvent(
        new CustomEvent(WALLET_STANDARD_READY, {
          detail: { register },
          bubbles: false,
          cancelable: false,
        })
      );
    } catch {
      // ignore
    }
  }

  notify = true;

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

      if (target) {
        for (const legacy of listLegacyProviders(target)) {
          if (names.has(legacy.name.toLowerCase())) {
            continue;
          }
          names.add(legacy.name.toLowerCase());
          wallets.push(legacy);
        }
      }

      return wallets;
    },
    destroy() {
      notify = false;
      if (target) {
        target.removeEventListener(WALLET_STANDARD_REGISTER, onRegisterWallet);
      }
    },
  };
}

export function describeDiscoveredWallets(wallets: DiscoveredWallet[]): {
  count: number;
  names: string[];
  kinds: Array<DiscoveredWallet["kind"]>;
} {
  return summarizeDiscovery(wallets);
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
  const key =
    (connected && connected.publicKey) || wallet.legacyProvider.publicKey;
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
  const extra =
    (wallet.id === "legacy:backpack" || wallet.legacyProvider.isBackpack) &&
    wallet.legacyProvider.publicKey
      ? wallet.legacyProvider.publicKey
      : "utf8";
  const signed = await wallet.legacyProvider.signMessage(bytes, extra);
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
