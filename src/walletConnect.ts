import { shortenWallet } from "./shortenWallet.ts";
import {
  bytesToBase64,
  getWalletApiBaseUrlFromEnv,
  requestWalletChallenge,
  requestWalletVerify,
} from "./walletConnectApi.ts";
import {
  WALLET_COPY,
  initialWalletConnectModel,
  mapApiErrorToView,
  telegramReturnUrl,
  type WalletConnectModel,
} from "./walletConnectState.ts";
import {
  connectDiscoveredWallet,
  createWalletRegistry,
  signMessageWithWallet,
  type ConnectedWallet,
  type DiscoveredWallet,
} from "./solanaWallets.ts";

const DEFAULT_BOT = "ManGoMemeFunCommunityBot";

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function setHidden(el: HTMLElement | null, hidden: boolean): void {
  if (!el) {
    return;
  }
  el.hidden = hidden;
}

function render(model: WalletConnectModel, connected: ConnectedWallet | null): void {
  const title = $("wc-title");
  const body = $("wc-body");
  const error = $("wc-error");
  const address = $("wc-address");
  const connectBtn = $("wc-connect") as HTMLButtonElement | null;
  const verifyBtn = $("wc-verify") as HTMLButtonElement | null;
  const picker = $("wc-picker");
  const returnLink = $("wc-return") as HTMLAnchorElement | null;
  const status = $("wc-status");

  const copy =
    model.view === "expired"
      ? WALLET_COPY.expired
      : model.view === "used"
        ? WALLET_COPY.used
        : model.view === "success"
          ? WALLET_COPY.success
          : model.view === "missing_token"
            ? WALLET_COPY.missing_token
            : model.view === "no_wallets"
              ? WALLET_COPY.no_wallets
              : WALLET_COPY.idle;

  if (title) {
    title.textContent = copy.title;
  }
  if (body) {
    body.textContent = copy.body;
  }

  if (error) {
    if (model.view === "error" && model.errorMessage) {
      error.textContent = model.errorMessage;
      error.hidden = false;
    } else {
      error.textContent = "";
      error.hidden = true;
    }
  }

  const showConnect =
    model.view === "idle" ||
    model.view === "connecting" ||
    model.view === "no_wallets" ||
    model.view === "error";
  const showVerify = model.view === "connected" || model.view === "verifying";
  const showReturn = model.view === "success" || model.view === "expired" || model.view === "used";

  setHidden(connectBtn, !showConnect || model.view === "no_wallets");
  setHidden(verifyBtn, !showVerify);
  setHidden(picker, true);
  setHidden(returnLink, !showReturn);

  if (connectBtn) {
    connectBtn.disabled = model.view === "connecting";
    connectBtn.textContent = model.view === "connecting" ? "Connecting…" : "Connect Wallet";
  }
  if (verifyBtn) {
    verifyBtn.disabled = model.view === "verifying";
    verifyBtn.textContent = model.view === "verifying" ? "Verifying…" : "Verify Wallet";
  }

  if (address) {
    if (connected && (model.view === "connected" || model.view === "verifying")) {
      address.hidden = false;
      address.textContent = shortenWallet(connected.address);
    } else {
      address.hidden = true;
      address.textContent = "";
    }
  }

  if (status) {
    if (model.view === "connected") {
      status.hidden = false;
      status.textContent = WALLET_COPY.connected_status;
    } else {
      status.hidden = true;
      status.textContent = "";
    }
  }
}

function stripTokenFromUrl(): void {
  if (typeof window === "undefined" || !window.history || !window.history.replaceState) {
    return;
  }
  window.history.replaceState({}, document.title, "/wallet-connect");
}

export function initWalletConnectPage(): void {
  const search = typeof window !== "undefined" ? window.location.search : "";
  let model = initialWalletConnectModel(search);
  let connected: ConnectedWallet | null = null;
  const registry = createWalletRegistry();

  const api = getWalletApiBaseUrlFromEnv(import.meta.env, window.location.protocol);
  const botUsername =
    import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.trim() || DEFAULT_BOT;
  const returnLink = $("wc-return") as HTMLAnchorElement | null;
  if (returnLink) {
    returnLink.href = telegramReturnUrl(botUsername);
  }

  if (!api.baseUrl && model.view === "idle") {
    model = {
      ...model,
      view: "error",
      errorMessage: api.error || "Wallet verification is not configured.",
    };
  }

  render(model, connected);

  const connectBtn = $("wc-connect") as HTMLButtonElement | null;
  const verifyBtn = $("wc-verify") as HTMLButtonElement | null;
  const picker = $("wc-picker");

  async function connectOne(wallet: DiscoveredWallet): Promise<void> {
    model = { ...model, view: "connecting", errorMessage: null };
    render(model, connected);
    try {
      connected = await connectDiscoveredWallet(wallet);
      model = {
        ...model,
        view: "connected",
        walletAddress: connected.address,
        walletName: connected.name,
        errorMessage: null,
      };
    } catch (err) {
      const message =
        err instanceof Error && /reject|cancel|denied/i.test(err.message)
          ? "Wallet connection was cancelled."
          : WALLET_COPY.connect_failed;
      model = { ...model, view: "error", errorMessage: message };
      connected = null;
    }
    render(model, connected);
  }

  connectBtn?.addEventListener("click", () => {
    if (!model.token) {
      return;
    }
    const wallets = registry.list();
    if (wallets.length === 0) {
      model = { ...model, view: "no_wallets" };
      render(model, connected);
      return;
    }
    if (wallets.length === 1) {
      void connectOne(wallets[0]);
      return;
    }
    if (!picker) {
      void connectOne(wallets[0]);
      return;
    }
    picker.innerHTML = "";
    for (const wallet of wallets) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-solscan wc-picker-btn";
      button.textContent = wallet.name;
      button.addEventListener("click", () => {
        picker.hidden = true;
        void connectOne(wallet);
      });
      picker.appendChild(button);
    }
    picker.hidden = false;
  });

  verifyBtn?.addEventListener("click", async () => {
    const token = model.token;
    const activeWallet = connected;
    if (!token || !activeWallet || !api.baseUrl) {
      return;
    }
    model = { ...model, view: "verifying", errorMessage: null };
    render(model, activeWallet);

    const challenge = await requestWalletChallenge(
      api.baseUrl,
      token,
      activeWallet.address
    );
    if (!challenge.ok || !challenge.challengeId || !challenge.message) {
      const mapped = mapApiErrorToView(challenge.error);
      model = { ...model, view: mapped.view, errorMessage: mapped.message };
      if (mapped.view === "expired" || mapped.view === "used" || mapped.view === "success") {
        stripTokenFromUrl();
      }
      render(model, activeWallet);
      return;
    }

    let signatureBytes: Uint8Array;
    try {
      signatureBytes = await signMessageWithWallet(activeWallet, challenge.message);
    } catch (err) {
      const cancelled =
        err instanceof Error && /reject|cancel|denied/i.test(err.message);
      model = {
        ...model,
        view: "connected",
        errorMessage: cancelled
          ? "Signature cancelled. No transaction was sent."
          : "Could not sign the verification message.",
      };
      render(model, activeWallet);
      return;
    }

    const verified = await requestWalletVerify(api.baseUrl, {
      token,
      wallet: activeWallet.address,
      challengeId: challenge.challengeId,
      signature: bytesToBase64(signatureBytes),
    });

    if (!verified.ok) {
      const mapped = mapApiErrorToView(verified.error);
      model = {
        ...model,
        view: mapped.view === "error" ? "connected" : mapped.view,
        errorMessage: mapped.message,
      };
      if (mapped.view === "expired" || mapped.view === "used") {
        stripTokenFromUrl();
      }
      render(model, activeWallet);
      return;
    }

    model = { ...model, view: "success", errorMessage: null };
    stripTokenFromUrl();
    render(model, activeWallet);
  });
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => initWalletConnectPage());
  } else {
    initWalletConnectPage();
  }
}
