export type GatewayName = "mock" | "authorize_net" | "nmi" | "square" | "viva";

export function getGatewayName(): GatewayName {
  const g = (process.env.PAYMENT_GATEWAY || "mock").toLowerCase() as GatewayName;
  if (["mock", "authorize_net", "nmi", "square", "viva"].includes(g)) return g;
  return "mock";
}

export function getGatewayConfig() {
  return {
    gateway: getGatewayName(),
    mode: process.env.PAYMENT_MODE || "sandbox",
    authorizeNet: {
      loginId: process.env.AUTHORIZENET_API_LOGIN_ID || "",
      transactionKey: process.env.AUTHORIZENET_TRANSACTION_KEY || "",
      sandbox: (process.env.PAYMENT_MODE || "sandbox") !== "live",
    },
    nmi: {
      securityKey: process.env.NMI_SECURITY_KEY || "",
      sandbox: (process.env.PAYMENT_MODE || "sandbox") !== "live",
    },
    square: {
      accessToken: process.env.SQUARE_ACCESS_TOKEN || "",
      locationId: process.env.SQUARE_LOCATION_ID || "",
      appId: process.env.SQUARE_APP_ID || "",
    },
    viva: {
      merchantId: process.env.VIVA_MERCHANT_ID || "",
      apiKey: process.env.VIVA_API_KEY || "",
      sandbox: (process.env.PAYMENT_MODE || "sandbox") !== "live",
    },
  };
}

export type PaymentIntent = {
  intentId: string;
  gateway: GatewayName;
  amount: number;
  currency: string;
  status: "requires_payment" | "authorized" | "captured" | "failed";
  clientSecret?: string;
  redirectUrl?: string;
};

/**
 * Modular gateway adapter.
 * - mock: instantly authorizes; webhook then captures + deducts stock.
 * - authorize_net / nmi / square / viva: sandbox stubs that simulate the same
 *   interface so you can drop in real SDK calls by filling env vars.
 * Real charge code paths are isolated here; API routes never touch SDKs directly.
 */
export async function createPaymentIntent(opts: {
  amount: number;
  currency?: string;
  orderId: string;
  cardLast4?: string;
}): Promise<PaymentIntent> {
  const gateway = getGatewayName();
  const currency = opts.currency || "GBP";
  const intentId = `${gateway}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // In production you would call the gateway SDK here using getGatewayConfig().
  // Each branch is intentionally separate so high-risk vape-friendly processors
  // can be enabled by env var without touching checkout logic.
  switch (gateway) {
    case "authorize_net":
      // Authorize.Net: would use AIM / Accept.js with API_LOGIN_ID + TRANSACTION_KEY
      return { intentId, gateway, amount: opts.amount, currency, status: "authorized" };
    case "nmi":
      // NMI: would POST to secure.nmi.com/api/transact.php with security_key
      return { intentId, gateway, amount: opts.amount, currency, status: "authorized" };
    case "square":
      // Square: would use Square Payments API with accessToken + locationId
      return { intentId, gateway, amount: opts.amount, currency, status: "authorized" };
    case "viva":
      // Viva Wallet: would create payment order + return redirectUrl
      return {
        intentId,
        gateway,
        amount: opts.amount,
        currency,
        status: "requires_payment",
        redirectUrl: `/checkout/mock-pay?intent=${intentId}&order=${opts.orderId}`,
      };
    case "mock":
    default:
      return {
        intentId,
        gateway: "mock",
        amount: opts.amount,
        currency,
        status: "authorized",
        clientSecret: `mock_secret_${intentId}`,
      };
  }
}

export function webhookSecretFor(gateway: GatewayName) {
  switch (gateway) {
    case "authorize_net":
      return process.env.AUTHORIZENET_WEBHOOK_SECRET || "wh_mock";
    case "nmi":
      return process.env.NMI_WEBHOOK_SECRET || "wh_mock";
    case "square":
      return process.env.SQUARE_WEBHOOK_SECRET || "wh_mock";
    case "viva":
      return process.env.VIVA_WEBHOOK_SECRET || "wh_mock";
    default:
      return process.env.MOCK_WEBHOOK_SECRET || "wh_mock_secret";
  }
}

/** Verify inbound webhook signature. Mock gateway accepts ?secret= or matching header. */
export function verifyWebhook(gateway: GatewayName, req: Request, bodyText: string): boolean {
  const expected = webhookSecretFor(gateway);
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === expected) return true;
  const sig =
    req.headers.get("x-webhook-signature") || req.headers.get("x-square-hmacsha256-signature") || "";
  // Mock mode: allow unsigned local calls for easy testing, but require secret in production
  if (gateway === "mock" && process.env.NODE_ENV !== "production") return true;
  return sig === expected && bodyText.length >= 0;
}

export function shippingRates(subtotal: number) {
  // Free over £50, standard £3.99, express £7.99
  return [
    { id: "standard", label: "Standard (2–4 days)", cost: subtotal >= 50 ? 0 : 3.99, eta: "2–4 days" },
    { id: "express", label: "Express (Next day)", cost: 7.99, eta: "Next working day" },
    { id: "click_collect", label: "Click & Collect", cost: 0, eta: "Same day" },
  ];
}
