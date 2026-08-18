/**
 * Admin delivery submit flow: payment → construct/sign/send → confirm.
 * Extracted so the page module (DOM bind) is not imported by tests.
 */

import { logDeliveryDebug, logDeliveryError } from "./adminDeliveryDebug.js";

export async function submitAdminDelivery(input) {
  const requestPayment = input.requestPayment;
  const requestConfirm = input.requestConfirm;
  const signAndSend = input.signAndSend;
  const baseUrl = input.baseUrl;
  const token = input.token;
  const wallet = input.wallet;

  logDeliveryDebug("payment-request-started", { hasBaseUrl: Boolean(baseUrl) });
  const payment = await requestPayment(baseUrl, token);
  if (!payment || !payment.ok || !payment.recentBlockhash || !payment.from || !payment.to || !payment.mint) {
    logDeliveryDebug("payment-response-invalid", {
      ok: Boolean(payment && payment.ok),
      blockhashPresent: Boolean(payment && payment.recentBlockhash),
    });
    return {
      ok: false,
      confirmCalled: false,
      view: "error",
      errorMessage: (payment && payment.error) || "Invalid request.",
    };
  }

  logDeliveryDebug("payment-response", {
    ok: true,
    blockhashPresent: true,
    blockhashLength: String(payment.recentBlockhash).length,
    decimals: Number(payment.decimals) || 9,
    amountBaseUnits: String(payment.amountBaseUnits),
    memoPrefixOk: String(payment.memo || "").startsWith("mango-delivery:"),
  });

  let signature;
  try {
    signature = await signAndSend(wallet, {
      from: payment.from,
      to: payment.to,
      mint: payment.mint,
      amountBaseUnits: String(payment.amountBaseUnits),
      decimals: Number(payment.decimals) || 9,
      memo: String(payment.memo),
      recentBlockhash: payment.recentBlockhash,
    });
  } catch (err) {
    logDeliveryError(err, "sign-send");
    return { ok: false, confirmCalled: false, view: "transaction_failed", errorMessage: null };
  }

  if (typeof signature !== "string" || !signature) {
    logDeliveryDebug("signature-missing", { gotType: typeof signature });
    return { ok: false, confirmCalled: false, view: "transaction_failed", errorMessage: null };
  }

  logDeliveryDebug("confirm-started", { signatureLength: signature.length });
  if (typeof input.onSigned === "function") {
    input.onSigned();
  }
  const confirmed = await requestConfirm(baseUrl, token, signature);
  if (!confirmed || !confirmed.ok) {
    logDeliveryDebug("confirm-failed", { ok: false });
    return {
      ok: false,
      confirmCalled: true,
      view: "error",
      errorMessage: (confirmed && confirmed.error) || "This transaction could not be verified.",
    };
  }
  logDeliveryDebug("confirm-succeeded", { idempotent: Boolean(confirmed.idempotent) });
  return {
    ok: true,
    confirmCalled: true,
    signatureLength: signature.length,
    idempotent: Boolean(confirmed.idempotent),
  };
}
