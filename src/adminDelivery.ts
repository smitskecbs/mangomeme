import { shortenWallet } from "./shortenWallet.ts";
import {
  connectDiscoveredWallet,
  createWalletRegistry,
  type ConnectedWallet,
} from "./solanaWallets.ts";
import {
  getDeliveryApiBaseUrl,
  requestDeliveryConfirm,
  requestDeliveryPayment,
  requestDeliveryStatus,
} from "./adminDeliveryApi.ts";
import {
  DELIVERY_COPY,
  WAITING_COPY,
  initialDeliveryModel,
  reviewText,
  deliverySignatureStorageKey,
  isWaitingDeliveryState,
  type DeliveryModel,
  type DeliveryView,
} from "./adminDeliveryState.ts";
import { signAndSendDeliveryTransfer } from "./solanaDeliveryWallet.js";
import { submitAdminDelivery } from "./adminDeliverySubmit.js";
import { logDeliveryError } from "./adminDeliveryDebug.js";

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function setHidden(el: HTMLElement | null, hidden: boolean): void {
  if (!el) {
    return;
  }
  el.hidden = hidden;
}

let model: DeliveryModel = initialDeliveryModel(
  typeof window !== "undefined" ? window.location.search : "",
  typeof window !== "undefined" ? window.location.pathname : ""
);
let connected: ConnectedWallet | null = null;
const registry = createWalletRegistry({
  onChange: () => {
    if (model.view === "discovering" || model.view === "wallet_not_connected") {
      render(model);
    }
  },
});

function copyFor(view: DeliveryView): { title: string; body: string } {
  if (view === "error") {
    return {
      title: "🎁 ManGo Delivery",
      body: model.errorMessage || "Invalid request.",
    };
  }
  if (view === "review") {
    return {
      title: "🎁 ManGo Delivery",
      body: model.status ? reviewText(model.status) : "Review this delivery.",
    };
  }
  if (view === "submitting") {
    return { title: "🎁 Confirm in wallet", body: "Approve the transfer in your wallet." };
  }
  if (view === "verifying") {
    return {
      title: "🎁 Verifying on-chain",
      body: "Checking the Solana transaction. Status updates only after verification.",
    };
  }
  if (view === "waiting") {
    return WAITING_COPY;
  }
  return DELIVERY_COPY[view];
}

function render(next: DeliveryModel): void {
  model = next;
  const title = $("ad-title");
  const body = $("ad-body");
  const error = $("ad-error");
  const address = $("ad-address");
  const review = $("ad-review");
  const connectBtn = $("ad-connect") as HTMLButtonElement | null;
  const confirmBtn = $("ad-confirm") as HTMLButtonElement | null;
  const copy = copyFor(model.view);

  if (title) title.textContent = copy.title;
  if (body) body.textContent = copy.body;

  if (error) {
    if (model.view === "error" && model.errorMessage) {
      error.textContent = model.errorMessage;
      setHidden(error, false);
    } else {
      setHidden(error, true);
    }
  }

  if (address) {
    if (connected) {
      address.textContent = shortenWallet(connected.address);
      setHidden(address, false);
    } else {
      setHidden(address, true);
    }
  }

  if (review) {
    if (model.view === "review" && model.status) {
      review.textContent = reviewText(model.status);
      setHidden(review, false);
    } else {
      setHidden(review, true);
    }
  }

  if (connectBtn) {
    const show =
      model.view === "wallet_not_connected" ||
      model.view === "wallet_mismatch" ||
      model.view === "discovering";
    setHidden(connectBtn, !show);
    connectBtn.disabled = model.view === "discovering";
  }
  if (confirmBtn) {
    setHidden(confirmBtn, model.view !== "review");
    confirmBtn.disabled = model.view !== "review";
  }
}

function readStoredSignature(token: string): string | null {
  try {
    const value = sessionStorage.getItem(deliverySignatureStorageKey(token));
    return typeof value === "string" && value ? value : null;
  } catch (_err) {
    return null;
  }
}

function writeStoredSignature(token: string, signature: string): void {
  try {
    sessionStorage.setItem(deliverySignatureStorageKey(token), signature);
  } catch (_err) {
    // ignore quota / private mode
  }
}

function viewForLoadedStatus(
  status: NonNullable<DeliveryModel["status"]>,
  walletAddress: string | null
): DeliveryView {
  if (status.deliveryState === "sent") {
    return "success";
  }
  if (status.deliveryState === "failed") {
    return "error";
  }
  const stored = model.token ? readStoredSignature(model.token) : null;
  if (isWaitingDeliveryState(status.deliveryState) || status.hasSignature || stored) {
    return "waiting";
  }
  if (!walletAddress) {
    return "wallet_not_connected";
  }
  if (walletAddress !== status.expectedSigner) {
    return "wallet_mismatch";
  }
  return "review";
}

async function resumeConfirmation(signature: string): Promise<void> {
  const api = getDeliveryApiBaseUrl(import.meta.env, window.location.protocol);
  if (!api.baseUrl || !model.token) {
    return;
  }
  render({ ...model, view: "waiting" });
  const result = await submitAdminDelivery({
    baseUrl: api.baseUrl,
    token: model.token,
    wallet: connected,
    existingSignature: signature,
    requestPayment: requestDeliveryPayment,
    requestConfirm: requestDeliveryConfirm,
    signAndSend: signAndSendDeliveryTransfer,
  });
  applySubmitResult(result);
}

function applySubmitResult(result: {
  ok: boolean;
  view?: string;
  errorMessage?: string | null;
  pending?: boolean;
  idempotent?: boolean;
  signature?: string;
}): void {
  if (result.ok) {
    render({
      ...model,
      view: result.idempotent ? "already_sent" : "success",
    });
    return;
  }
  if (result.view === "waiting" || result.pending) {
    render({ ...model, view: "waiting", errorMessage: null });
    return;
  }
  render({
    ...model,
    view: result.view === "transaction_failed" ? "transaction_failed" : "error",
    errorMessage: result.errorMessage || null,
  });
}

async function loadStatus(): Promise<void> {
  if (!model.token) {
    render({ ...model, view: "missing_token" });
    return;
  }
  const api = getDeliveryApiBaseUrl(import.meta.env, window.location.protocol);
  if (api.error || !api.baseUrl) {
    render({ ...model, view: "error", errorMessage: api.error || "Invalid request." });
    return;
  }
  const status = await requestDeliveryStatus(api.baseUrl, model.token);
  if (!status.ok || !status.expectedSigner || !status.destination || !status.amountBaseUnits) {
    const reason = (status as { reason?: string }).reason;
    const stored = readStoredSignature(model.token);
    if (stored && reason === "expired") {
      render({ ...model, view: "waiting" });
      await resumeConfirmation(stored);
      return;
    }
    if (reason === "expired") {
      render({ ...model, view: "expired_session" });
      return;
    }
    render({
      ...model,
      view: "invalid_session",
      errorMessage: status.error || null,
    });
    return;
  }
  const loaded = status as DeliveryModel["status"];
  const nextView = viewForLoadedStatus(loaded as NonNullable<DeliveryModel["status"]>, connected && connected.address);
  render({
    ...model,
    status: loaded,
    view: nextView,
  });
  if (nextView === "waiting") {
    const stored = readStoredSignature(model.token);
    if (stored) {
      await resumeConfirmation(stored);
    }
  }
}

async function connectWallet(): Promise<void> {
  const wallets = registry.list();
  const first = wallets[0];
  if (!first) {
    render({ ...model, view: "wallet_not_connected" });
    return;
  }
  try {
    connected = await connectDiscoveredWallet(first);
    if (!model.status) {
      await loadStatus();
      return;
    }
    render({
      ...model,
      connectedWallet: connected.address,
      view: viewForLoadedStatus(model.status, connected.address),
    });
  } catch (err) {
    logDeliveryError(err, "wallet-connect");
    render({ ...model, view: "error", errorMessage: "Wallet connection failed." });
  }
}

async function confirmDelivery(): Promise<void> {
  if (!model.token || !model.status || !connected) {
    return;
  }
  if (model.view !== "review") {
    return;
  }
  if (connected.address !== model.status.expectedSigner) {
    render({ ...model, view: "wallet_mismatch" });
    return;
  }
  const stored = readStoredSignature(model.token);
  if (stored) {
    await resumeConfirmation(stored);
    return;
  }
  const api = getDeliveryApiBaseUrl(import.meta.env, window.location.protocol);
  if (!api.baseUrl) {
    render({ ...model, view: "error", errorMessage: api.error || "Invalid request." });
    return;
  }
  render({ ...model, view: "submitting" });
  const result = await submitAdminDelivery({
    baseUrl: api.baseUrl,
    token: model.token,
    wallet: connected,
    requestPayment: requestDeliveryPayment,
    requestConfirm: requestDeliveryConfirm,
    signAndSend: signAndSendDeliveryTransfer,
    onSigned: (signature: string) => {
      writeStoredSignature(model.token as string, signature);
      render({ ...model, view: "waiting" });
    },
  });
  applySubmitResult(result);
}

function bind(): void {
  $("ad-connect")?.addEventListener("click", () => {
    void connectWallet();
  });
  $("ad-confirm")?.addEventListener("click", () => {
    void confirmDelivery();
  });
}

bind();
void loadStatus();
