import { shortenWallet } from "./shortenWallet.ts";
import {
  connectDiscoveredWallet,
  createWalletRegistry,
  type ConnectedWallet,
  type DiscoveredWallet,
} from "./solanaWallets.ts";
import {
  getPresaleApiBaseUrl,
  requestPresaleConfirm,
  requestPresalePayment,
  requestPresalePrepare,
  requestPresaleStatus,
} from "./presaleApi.ts";
import {
  PRESALE_COPY,
  initialPresaleModel,
  reviewDisclaimer,
  viewAfterStatus,
  hasActivePaymentValidity,
  type PresaleAmount,
  type PresaleModel,
  type PresaleView,
} from "./presaleState.ts";
import { signAndSendPresaleTransfer } from "./solanaPresaleWallet.ts";

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

function setHidden(el: HTMLElement | null, hidden: boolean): void {
  if (!el) {
    return;
  }
  el.hidden = hidden;
}

let model: PresaleModel = initialPresaleModel(
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

function copyFor(view: PresaleView): { title: string; body: string } {
  if (view === "error") {
    return {
      title: "🥭 ManGo Presale",
      body: model.errorMessage || "Invalid request.",
    };
  }
  if (view === "amount") {
    return {
      title: "🥭 Choose an amount",
      body: "Select a SOL amount. There is no bonus, tier, or referral discount.",
    };
  }
  if (view === "reserving") {
    return { title: "🥭 Reserving", body: "Holding this amount in the presale while you review." };
  }
  if (view === "review" || view === "reserved" || view === "wallet_confirmation") {
    return {
      title: "🥭 Review contribution",
      body: reviewDisclaimer(),
    };
  }
  if (view === "submitting") {
    return { title: "🥭 Confirm in wallet", body: "Approve the SOL transfer in your wallet." };
  }
  if (view === "verifying") {
    return {
      title: "🥭 Verifying on-chain",
      body: "Checking the Solana transaction. Allocation is recorded only after confirmation.",
    };
  }
  return PRESALE_COPY[view];
}

function render(next: PresaleModel): void {
  model = next;
  const title = $("ps-title");
  const body = $("ps-body");
  const error = $("ps-error");
  const address = $("ps-address");
  const status = $("ps-status");
  const amounts = $("ps-amounts");
  const review = $("ps-review");
  const connectBtn = $("ps-connect") as HTMLButtonElement | null;
  const confirmBtn = $("ps-confirm") as HTMLButtonElement | null;
  const returnLink = $("ps-return") as HTMLAnchorElement | null;
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

  if (status && model.status) {
    const remaining = model.status.remainingMango;
    const available = model.status.availableSol ? `Available: ${model.status.availableSol} SOL. ` : "";
    status.textContent = `${available}Remaining: ${remaining} / ${model.status.targetMango} MANGO`;
    setHidden(status, model.view === "not_live" || model.view === "missing_token");
  }

  if (amounts) {
    amounts.replaceChildren();
    const showAmounts = model.view === "amount" && model.status;
    if (showAmounts && model.status) {
      for (const amount of model.status.amounts) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn btn-copy";
        btn.textContent = `${amount.sol} SOL → ${amount.mango} MANGO`;
        btn.addEventListener("click", () => {
          void selectAmount(amount);
        });
        amounts.appendChild(btn);
      }
    }
    setHidden(amounts, !showAmounts);
  }

  if (review) {
    const showReview =
      (model.view === "review" ||
        model.view === "reserved" ||
        model.view === "wallet_confirmation") &&
      model.prepare;
    if (showReview && model.prepare) {
      review.replaceChildren();
      const lines = [
        `You send: ${model.prepare.sol} SOL`,
        `You receive after distribution: ${model.prepare.mango} MANGO`,
        `From wallet: ${model.prepare.fromShort}`,
        `Presale wallet: ${model.prepare.toShort}`,
        `Rate: 1 SOL = 20,000 MANGO`,
        reviewDisclaimer(),
      ];
      for (const line of lines) {
        const p = document.createElement("p");
        p.textContent = line;
        review.appendChild(p);
      }
    }
    setHidden(review, !showReview);
  }

  setHidden(connectBtn, model.view !== "wallet_not_connected" && model.view !== "wallet_mismatch");
  setHidden(
    confirmBtn,
    model.view !== "review" && model.view !== "reserved" && model.view !== "wallet_confirmation"
  );
  setHidden(
    returnLink,
    model.view !== "success" &&
      model.view !== "confirmed" &&
      model.view !== "already_recorded" &&
      model.view !== "sold_out" &&
      model.view !== "not_live" &&
      model.view !== "reservation_expired"
  );
}

async function refreshStatus(): Promise<void> {
  if (!model.token) {
    render({ ...model, view: "missing_token" });
    return;
  }
  const api = getPresaleApiBaseUrl(import.meta.env, window.location.protocol);
  if (!api.baseUrl) {
    render({ ...model, view: "error", errorMessage: api.error || "Presale is not configured." });
    return;
  }
  const status = await requestPresaleStatus(api.baseUrl, model.token);
  if (!status.ok) {
    const reason = status.error || "";
    const view: PresaleView = /expired/i.test(reason) ? "expired_session" : "invalid_session";
    render({ ...model, view, errorMessage: status.error || null });
    return;
  }
  const payload = status as PresaleModel["status"];
  if (!payload) {
    render({ ...model, view: "invalid_session" });
    return;
  }
  const view = viewAfterStatus(model, payload, connected ? connected.address : null);
  let prepare = model.prepare;
  if (view === "reserved" && payload.activeReservation) {
    prepare = {
      orderId: payload.activeReservation.orderId,
      memo: payload.activeReservation.memo || "",
      from: payload.activeReservation.from || payload.expectedWallet,
      to: payload.activeReservation.to || "",
      lamports: payload.activeReservation.lamports,
      sol: payload.activeReservation.sol,
      mango: payload.activeReservation.mango,
      fromShort: payload.activeReservation.fromShort || "",
      toShort: payload.activeReservation.toShort || payload.treasuryShort,
      network: "mainnet-beta",
      expiresAt: payload.activeReservation.expiresAt,
      status: payload.activeReservation.status,
      recentBlockhash: payload.activeReservation.recentBlockhash,
      lastValidBlockHeight: payload.activeReservation.lastValidBlockHeight,
    };
  }
  render({ ...model, status: payload, view, prepare });
}

async function selectAmount(amount: PresaleAmount): Promise<void> {
  if (!model.token) {
    return;
  }
  const api = getPresaleApiBaseUrl(import.meta.env, window.location.protocol);
  if (!api.baseUrl) {
    return;
  }
  render({ ...model, view: "reserving", selected: amount });
  const prepared = await requestPresalePrepare(api.baseUrl, model.token, amount.lamports);
  if (!prepared.ok) {
    const err = prepared.error || "Invalid request.";
    const view: PresaleView = /sold out/i.test(err)
      ? "sold_out"
      : /maximum/i.test(err)
        ? "user_max"
        : /expired/i.test(err)
          ? "reservation_expired"
          : "error";
    render({ ...model, view, errorMessage: err });
    return;
  }
  render({
    ...model,
    view: "reserved",
    selected: amount,
    prepare: prepared as PresaleModel["prepare"],
  });
}

async function confirm(): Promise<void> {
  if (!connected || !model.prepare || !model.token) {
    return;
  }
  const api = getPresaleApiBaseUrl(import.meta.env, window.location.protocol);
  if (!api.baseUrl) {
    return;
  }
  render({ ...model, view: "submitting" });
  const payment = await requestPresalePayment(api.baseUrl, model.token, model.prepare.orderId);
  const recentBlockhash = payment.recentBlockhash;
  if (!payment.ok || !recentBlockhash) {
    const err = payment.error || "Your presale reservation expired. Create a new one.";
    const view: PresaleView = /sold out/i.test(err)
      ? "sold_out"
      : /maximum/i.test(err)
        ? "user_max"
        : "reservation_expired";
    render({ ...model, view, errorMessage: err, prepare: null });
    return;
  }
  const payable = {
    ...model.prepare,
    ...payment,
    recentBlockhash,
    lastValidBlockHeight: payment.lastValidBlockHeight,
    status: payment.status,
  };
  render({ ...model, prepare: payable, view: "submitting" });
  if (!hasActivePaymentValidity(payable)) {
    render({ ...model, view: "reservation_expired", prepare: null });
    return;
  }
  let signature: string;
  try {
    signature = await signAndSendPresaleTransfer(connected, {
      from: payable.from,
      to: payable.to,
      lamports: payable.lamports,
      memo: payable.memo,
      recentBlockhash,
    });
  } catch {
    render({ ...model, view: "transaction_failed", prepare: payable });
    return;
  }
  render({ ...model, view: "verifying" });
  const confirmed = await requestPresaleConfirm(
    api.baseUrl,
    model.token,
    signature,
    payable.orderId
  );
  if (!confirmed.ok) {
    const err = confirmed.error || "";
    const view: PresaleView = /already recorded/i.test(err)
      ? "already_recorded"
      : /sold out/i.test(err)
        ? "sold_out"
        : /maximum/i.test(err)
          ? "user_max"
          : /reservation expired/i.test(err)
            ? "reservation_expired"
            : "transaction_failed";
    render({ ...model, view, errorMessage: err });
    return;
  }
  render({
    ...model,
    view: "confirmed",
    successSol: confirmed.sol || payable.sol,
    successMango: confirmed.mango || payable.mango,
  });
}

async function connectFirstWallet(): Promise<void> {
  const wallets: DiscoveredWallet[] = registry.list();
  if (!wallets.length) {
    render({ ...model, view: "wallet_not_connected" });
    return;
  }
  try {
    connected = await connectDiscoveredWallet(wallets[0]);
    await refreshStatus();
  } catch {
    render({ ...model, view: "wallet_not_connected" });
  }
}

const connectBtn = $("ps-connect");
if (connectBtn) {
  connectBtn.addEventListener("click", () => {
    void connectFirstWallet();
  });
}
const confirmBtn = $("ps-confirm");
if (confirmBtn) {
  confirmBtn.addEventListener("click", () => {
    if (!hasActivePaymentValidity(model.prepare)) {
      render({ ...model, view: "reservation_expired", prepare: null });
      return;
    }
    render({ ...model, view: "wallet_confirmation" });
    void confirm();
  });
}

void refreshStatus();
