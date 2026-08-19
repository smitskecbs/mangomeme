/**
 * Admin delivery submit flow: payment → construct/sign/send → confirm.
 * Extracted so the page module (DOM bind) is not imported by tests.
 */

import { logDeliveryDebug, logDeliveryError } from "./adminDeliveryDebug.js";

export const DEFAULT_CONFIRM_ATTEMPTS = 8;
export const DEFAULT_CONFIRM_RETRY_MS = 2000;

const REACHABILITY_ERROR = "We couldn't reach ManGo delivery. Please try again.";
const TEMPORARY_ERROR = "Delivery is temporarily unavailable. Please try again.";

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isConfirmPending(confirmed) {
  if (!confirmed) {
    return false;
  }
  if (confirmed.pending === true) {
    return true;
  }
  const status = confirmed.status;
  return (
    status === "pending" ||
    status === "reconciling" ||
    status === "submitted" ||
    status === "not-finalized"
  );
}

function isConfirmSent(confirmed) {
  if (!confirmed || confirmed.ok !== true) {
    return false;
  }
  if (isConfirmPending(confirmed)) {
    return false;
  }
  if (confirmed.status === "failed") {
    return false;
  }
  return confirmed.status === "sent" || confirmed.status === undefined || confirmed.status === "ok";
}

function isRetryableConfirm(confirmed) {
  if (isConfirmPending(confirmed)) {
    return true;
  }
  if (!confirmed || confirmed.ok === true) {
    return false;
  }
  const err = confirmed.error || "";
  return err === REACHABILITY_ERROR || err === TEMPORARY_ERROR;
}

async function confirmWithPolling(input, signature) {
  const maxAttempts =
    Number(input.confirmAttempts) > 0 ? Number(input.confirmAttempts) : DEFAULT_CONFIRM_ATTEMPTS;
  const delayMs =
    Number(input.confirmRetryMs) > 0 ? Number(input.confirmRetryMs) : DEFAULT_CONFIRM_RETRY_MS;
  const wait = typeof input.sleep === "function" ? input.sleep : sleep;
  let last = null;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const confirmed = await input.requestConfirm(input.baseUrl, input.token, signature);
    last = confirmed;
    if (isConfirmSent(confirmed)) {
      logDeliveryDebug("confirm-succeeded", { idempotent: Boolean(confirmed.idempotent) });
      return {
        ok: true,
        confirmCalled: true,
        signature,
        signatureLength: signature.length,
        idempotent: Boolean(confirmed.idempotent),
        confirmAttempts: attempt + 1,
      };
    }
    if (isRetryableConfirm(confirmed)) {
      logDeliveryDebug("confirm-pending", {
        attempt: attempt + 1,
      });
      if (attempt < maxAttempts - 1) {
        await wait(delayMs);
      }
      continue;
    }
    logDeliveryDebug("confirm-failed", { ok: false });
    return {
      ok: false,
      confirmCalled: true,
      signature,
      view: "error",
      errorMessage: (confirmed && confirmed.error) || "This transaction could not be verified.",
      confirmAttempts: attempt + 1,
    };
  }
  return {
    ok: false,
    pending: true,
    confirmCalled: true,
    signature,
    view: "waiting",
    errorMessage: null,
    confirmAttempts: maxAttempts,
    lastStatus: last && last.status,
  };
}

export async function submitAdminDelivery(input) {
  const requestPayment = input.requestPayment;
  const signAndSend = input.signAndSend;
  const baseUrl = input.baseUrl;
  const token = input.token;
  const wallet = input.wallet;
  const existingSignature =
    typeof input.existingSignature === "string" && input.existingSignature
      ? input.existingSignature
      : null;

  if (existingSignature) {
    logDeliveryDebug("confirm-resume", { signatureLength: existingSignature.length });
    if (typeof input.onSigned === "function") {
      input.onSigned(existingSignature);
    }
    return confirmWithPolling(input, existingSignature);
  }

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
    input.onSigned(signature);
  }
  return confirmWithPolling(input, signature);
}
