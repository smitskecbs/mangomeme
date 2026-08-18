/**
 * Temporary safe debug logging for admin delivery.
 * Never logs RPC URLs, API keys, session tokens, or signed transaction bytes.
 */

const PREFIX = "[delivery]";
const BLOCKED_KEYS = new Set([
  "token",
  "signature",
  "rpcurl",
  "rpc",
  "secret",
  "key",
  "transaction",
  "signed",
]);

export function isUnsafeDeliveryLogText(value) {
  const text = String(value || "");
  if (!text) {
    return false;
  }
  if (/https?:\/\//i.test(text)) {
    return true;
  }
  if (/api[-_]?key/i.test(text)) {
    return true;
  }
  if (/helius/i.test(text)) {
    return true;
  }
  if (/DELIVERY_RPC_URL/i.test(text)) {
    return true;
  }
  if (/[?&](?:token|api[-_]?key)=/i.test(text)) {
    return true;
  }
  return false;
}

function safeKey(key) {
  return typeof key === "string" && /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(key) && !BLOCKED_KEYS.has(key.toLowerCase());
}

function safeValue(value) {
  if (typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      return null;
    }
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  if (typeof value !== "string") {
    return null;
  }
  if (value.length > 96 || isUnsafeDeliveryLogText(value)) {
    return null;
  }
  return value;
}

export function logDeliveryDebug(step, extra) {
  const stepLabel = typeof step === "string" && /^[a-z0-9-]{1,48}$/i.test(step) ? step : "step";
  const parts = [`${PREFIX} ${stepLabel}`];
  if (extra && typeof extra === "object") {
    for (const [key, value] of Object.entries(extra)) {
      if (!safeKey(key)) {
        continue;
      }
      const rendered = safeValue(value);
      if (rendered === null) {
        continue;
      }
      parts.push(`${key}=${rendered}`);
    }
  }
  console.info(parts.join(" "));
}

export function logDeliveryError(err, step) {
  const stepLabel = typeof step === "string" && /^[a-z0-9-]{1,48}$/i.test(step) ? step : "unknown";
  const nameRaw = err && typeof err === "object" && typeof err.name === "string" ? err.name : "Error";
  const name = /^[A-Za-z][A-Za-z0-9_]*$/.test(nameRaw.slice(0, 64)) ? nameRaw.slice(0, 64) : "Error";
  const parts = [`${PREFIX} failed step=${stepLabel} name=${name}`];
  const code = err && typeof err === "object" ? err.code : undefined;
  if (typeof code === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(code)) {
    parts.push(`code=${code}`);
  } else if (typeof code === "number" && Number.isFinite(code)) {
    parts.push(`code=${String(Math.trunc(code)).slice(0, 16)}`);
  }
  const message = err && typeof err === "object" && typeof err.message === "string" ? err.message : "";
  if (message && message.length <= 180 && !isUnsafeDeliveryLogText(message)) {
    parts.push(`message=${message.replace(/\s+/g, " ").slice(0, 180)}`);
  }
  console.error(parts.join(" "));
  const isDev = Boolean(
    typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV
  );
  if (
    isDev &&
    err &&
    typeof err === "object" &&
    typeof err.stack === "string" &&
    !isUnsafeDeliveryLogText(err.stack)
  ) {
    console.error(`${PREFIX} stack ${err.stack.split("\n").slice(0, 6).join(" | ")}`);
  }
}
