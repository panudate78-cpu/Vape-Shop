// Mock/adapter payment module. Replace PAYMENT_GATEWAY when you go live.
// For vape in the UK, use a high-risk-friendly processor (Authorize.net via a high-risk merchant, NMI, Viva).

export type PaymentIntent = { id: string; status: 'requires_payment' | 'paid' | 'failed'; clientToken?: string };
export type WebhookEvent = { verified: boolean; paymentId: string; status: 'paid' | 'failed'; raw?: unknown };

const GW = (process.env.PAYMENT_GATEWAY || 'mock') as 'mock' | 'authorize_net' | 'nmi' | 'square' | 'viva';

export async function createPaymentIntent(args: {
  amount: number;
  orderId: number;
  email?: string;
  secret: string;
}): Promise<PaymentIntent> {
  switch (GW) {
    case 'mock':
      return { id: 'mock_pi_' + args.orderId + '_' + Date.now(), status: 'requires_payment' };
    default:
      // Placeholder — real integration goes here. For now fall back to mock so you can test.
      console.warn(`[payments] Gateway "${GW}" not configured — falling back to mock.`);
      return { id: `mock_pi_${args.orderId}`, status: 'requires_payment' };
  }
}

export async function verifyWebhook(body: any, query: Record<string, string>): Promise<WebhookEvent> {
  const secret = query.secret || process.env.WEBHOOK_SECRET || 'dev-secret';
  if (GW === 'mock') {
    if (query.secret !== 'dev-secret' && process.env.NODE_ENV === 'production') {
      return { verified: false, paymentId: '', status: 'failed' };
    }
    return { verified: true, paymentId: body.paymentId || 'mock_pay_' + Date.now(), status: body.status === 'failed' ? 'failed' : 'paid', raw: body };
  }
  return { verified: false, paymentId: '', status: 'failed' };
}

export async function captureMockPayment(paymentIntentId: string): Promise<{ success: boolean; paymentId: string }> {
  // Used by the mock UI checkout — simulates an immediate successful capture & webhook.
  return { success: true, paymentId: 'mock_pay_' + paymentIntentId };
}
