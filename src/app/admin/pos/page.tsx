'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { gbp } from '@/lib/format';
import { StaffBar, PinPad } from '@/components/till/staff-tools';
import { agePrompt, parseMg, ID_TYPES, REFUSAL_REASONS } from '@/lib/compliance-rules';
import { AgeCheckModal } from '@/components/till/age-check-modal';

type VarItem = {
  variantId: number; productId: number; sku: string; barcode: string | null;
  name: string; brand: string; category: string | null; variantLabel: string;
  image: string | null; stock: number; price: number;
  ageRestricted?: boolean; productKind?: string; nicotineStrength?: string;
};
type AgeDecision = { result: 'passed'; idType?: string; appearsOver25?: boolean } | { result: 'refused'; reasonCode: string; note?: string };
type CartLine = VarItem & { quantity: number; lineDiscountPct: number };
type Drill = { mode: 'cat' } | { mode: 'brand'; category: string } | { mode: 'variant'; category: string; brand: string };
type PayMethod = 'cash' | 'card' | 'split';
type Hold = { id: number; holdCode: string; customerLabel: string | null; items: any[]; discount: string; discountPct: string; note: string | null; createdAt: string };
type QueuedSale = { key: string; createdAt: number; total: number; body: any; error?: string };
type OrderView = {
  order: { id: number; total: number; createdAt: string; status: string; source: string | null };
  lines: { variantId: number | null; productName: string; variantLabel: string; sku: string; quantity: number; unitPrice: number }[];
  returns: { id: number; total: number }[];
};

const FAV_KEY = 'vc100.pos.favs';
const QUEUE_KEY = 'vc100.pos.queue';
const REGISTER_KEY = 'vc100.pos.register';
const CASH_QUICK = [5, 10, 20, 50];

const newKey = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
    ? crypto.randomUUID().replace(/-/g, '')
    : `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;

const readJSON = <T,>(k: string, fallback: T): T => {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};

export default function PosPage() {
  // ---- catalogue -----------------------------------------------------------
  const [items, setItems] = useState<VarItem[]>([]);
  const [discountCap, setDiscountCap] = useState(100);
  const [drill, setDrill] = useState<Drill>({ mode: 'cat' });
  const [q, setQ] = useState('');
  const [favs, setFavs] = useState<number[]>([]);

  // ---- basket --------------------------------------------------------------
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountGbp, setDiscountGbp] = useState(0);
  const [discountPct, setDiscountPct] = useState(0);
  const [note, setNote] = useState('');
  const [payment, setPayment] = useState<PayMethod>('cash');
  const [tendered, setTendered] = useState('');     // string for number pad
  const [splitCash, setSplitCash] = useState('');   // cash part of a split
  const [showCashModal, setShowCashModal] = useState(false);

  // ---- mode / returns ------------------------------------------------------
  const [mode, setMode] = useState<'sale' | 'return'>('sale');
  const [origId, setOrigId] = useState('');
  const [origOrder, setOrigOrder] = useState<OrderView | null>(null);
  const [retQty, setRetQty] = useState<Record<number, number>>({});
  const [retReason, setRetReason] = useState('');
  const [retMethod, setRetMethod] = useState<'cash' | 'card'>('cash');
  const [retCode, setRetCode] = useState('changed_mind');
  const [retResellable, setRetResellable] = useState(true);

  // ---- holds ---------------------------------------------------------------
  const [holds, setHolds] = useState<Hold[]>([]);
  const [showHolds, setShowHolds] = useState(false);

  // ---- status --------------------------------------------------------------
  const [busy, setBusy] = useState(false);
  const [register, setRegister] = useState('Till 1');   // this till's name, saved per browser
  const [cashRequest, setCashRequest] = useState(0);
  // Manager approval: asked when a cashier refunds or discounts above their cap.
  const [approval, setApproval] = useState<{ message: string; resolve: (pin: string | null) => void } | null>(null);
  const [ageGate, setAgeGate] = useState<{ prompts: string[]; resolve: (d: AgeDecision | null) => void } | null>(null);
  useEffect(() => { try { const r = localStorage.getItem(REGISTER_KEY); if (r) setRegister(r); } catch { /* ignore */ } }, []);
  const changeRegister = (r: string) => { setRegister(r); try { localStorage.setItem(REGISTER_KEY, r); } catch { /* ignore */ } };
  const inFlight = useRef(false);            // client double-click lock
  const idemKey = useRef<string>(newKey());  // one key per basket attempt
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [flash, setFlash] = useState<{ kind: 'ok' | 'err' | 'info'; text: string; receiptId?: number } | null>(null);

  const showFlash = useCallback((f: { kind: 'ok' | 'err' | 'info'; text: string; receiptId?: number }) => {
    setFlash(f);
    if (f.kind !== 'err') setTimeout(() => setFlash((cur) => (cur === f ? null : cur)), 6000);
  }, []);

  // ---- loaders -------------------------------------------------------------
  const loadItems = useCallback(async () => {
    try {
      const d = await fetch('/api/admin/pos').then((r) => r.json());
      setItems(d.items || []);
      if (d.discountCap != null) setDiscountCap(Number(d.discountCap));
    } catch { /* offline — keep last list */ }
  }, []);
  const loadHolds = useCallback(async () => {
    try { const d = await fetch('/api/admin/pos/holds').then((r) => r.json()); setHolds(d.holds || []); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadItems(); loadHolds();
    setFavs(readJSON<number[]>(FAV_KEY, []));
    setQueue(readJSON<QueuedSale[]>(QUEUE_KEY, []));
    setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, [loadItems, loadHolds]);

  useEffect(() => { localStorage.setItem(FAV_KEY, JSON.stringify(favs)); }, [favs]);
  useEffect(() => { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); }, [queue]);

  // ---- derived -------------------------------------------------------------
  const byBarcode = useMemo(() => {
    const m = new Map<string, VarItem>();
    for (const i of items) if (i.barcode) m.set(i.barcode, i);
    return m;
  }, [items]);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) { if (i.stock <= 0) continue; const c = i.category || 'Other'; m.set(c, (m.get(c) || 0) + 1); }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const brands = useMemo(() => {
    if (drill.mode === 'cat') return [];
    const m = new Map<string, number>();
    for (const i of items) {
      if (i.stock <= 0 || (i.category || 'Other') !== drill.category) continue;
      const b = i.brand || 'Other'; m.set(b, (m.get(b) || 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items, drill]);

  const visibleProducts = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (s) {
      return items.filter((i) => i.stock > 0 && (
        i.name.toLowerCase().includes(s) || (i.brand || '').toLowerCase().includes(s) ||
        (i.sku || '').toLowerCase().includes(s) || (i.barcode || '').toLowerCase().includes(s) ||
        (i.variantLabel || '').toLowerCase().includes(s)
      )).slice(0, 120);
    }
    if (drill.mode !== 'variant') return [];
    return items.filter((i) => i.stock > 0 && (i.category || 'Other') === drill.category && (i.brand || 'Other') === drill.brand);
  }, [items, drill, q]);

  const favItems = useMemo(() => favs.map((id) => items.find((i) => i.variantId === id)).filter(Boolean) as VarItem[], [favs, items]);

  // basket maths (display only — the server recomputes and is authoritative)
  const gross = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const lineDisc = cart.reduce((s, l) => s + l.price * l.quantity * (l.lineDiscountPct / 100), 0);
  const afterLines = gross - lineDisc;
  const basketPct = afterLines * (discountPct / 100);
  const totalDisc = lineDisc + basketPct + discountGbp;
  const total = Math.max(0, Math.round((gross - totalDisc) * 100) / 100);
  const itemCount = cart.reduce((s, l) => s + l.quantity, 0);
  const discountPctOfGross = gross > 0 ? (totalDisc / gross) * 100 : 0;
  const overCap = discountPctOfGross > discountCap + 1e-9;

  const tenderedNum = parseFloat(tendered) || 0;
  const splitCashNum = Math.min(total, parseFloat(splitCash) || 0);
  const splitCardNum = Math.max(0, Math.round((total - splitCashNum) * 100) / 100);
  const cashDue = payment === 'cash' ? total : payment === 'split' ? splitCashNum : 0;
  const changeDue = payment === 'cash' ? Math.max(0, tenderedNum - total) : 0;
  const cashShort = payment === 'cash' && tendered !== '' && tenderedNum < total;
  const splitInvalid = payment === 'split' && (splitCashNum <= 0 || splitCashNum >= total);

  // ---- basket actions ------------------------------------------------------
  const resetBasket = () => {
    setCart([]); setDiscountGbp(0); setDiscountPct(0); setNote(''); setTendered(''); setSplitCash('');
    setPayment('cash'); setShowCashModal(false); idemKey.current = newKey();
  };

  const addToCart = (v: VarItem) => {
    setCart((c) => {
      const ex = c.find((x) => x.variantId === v.variantId);
      if (ex) return ex.quantity >= v.stock ? c : c.map((x) => x.variantId === v.variantId ? { ...x, quantity: x.quantity + 1 } : x);
      return [...c, { ...v, quantity: 1, lineDiscountPct: 0 }];
    });
  };
  const changeQty = (id: number, delta: number) => {
    setCart((c) => c.map((x) => x.variantId === id ? { ...x, quantity: Math.max(0, Math.min(x.stock, x.quantity + delta)) } : x).filter((x) => x.quantity > 0));
  };
  const setLineDisc = (id: number, pct: number) => {
    setCart((c) => c.map((x) => x.variantId === id ? { ...x, lineDiscountPct: Math.max(0, Math.min(100, pct)) } : x));
  };
  const toggleFav = (id: number) => setFavs((f) => f.includes(id) ? f.filter((x) => x !== id) : [...f, id].slice(-24));

  // ---- barcode scanning (USB/Bluetooth keyboard-wedge scanners) ------------
  const handleScan = useCallback((code: string) => {
    const hit = byBarcode.get(code.trim());
    if (!hit) { showFlash({ kind: 'err', text: `Barcode ${code} not recognised or out of stock` }); return; }
    if (mode === 'return') { showFlash({ kind: 'info', text: 'Switch to Sale mode to scan items' }); return; }
    addToCart(hit);
    showFlash({ kind: 'ok', text: `Scanned: ${hit.name} (${hit.variantLabel})` });
  }, [byBarcode, mode, showFlash]);

  useEffect(() => {
    let buf = ''; let last = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Let normal typing in form fields work; the search box handles its own Enter.
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const now = Date.now();
      if (now - last > 80) buf = '';   // scanners type fast; humans don't
      last = now;
      if (e.key === 'Enter') { if (buf.length >= 4) handleScan(buf); buf = ''; return; }
      if (e.key.length === 1) buf += e.key;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleScan]);

  // ---- submit (sale) -------------------------------------------------------
  const buildSaleBody = () => {
    const base: any = {
      items: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity, ...(l.lineDiscountPct > 0 ? { lineDiscountPct: l.lineDiscountPct } : {}) })),
      paymentMethod: payment,
      staffNote: note,
      discount: discountGbp,
      discountPct,
      idempotencyKey: idemKey.current,
    };
    if (payment === 'cash' && tendered !== '') base.cashTendered = tenderedNum;
    if (payment === 'split') {
      base.payments = [{ method: 'cash', amount: splitCashNum }, { method: 'card', amount: splitCardNum }];
      if (tendered !== '') base.cashTendered = tenderedNum;
    }
    return base;
  };

  const askApproval = (message: string) => new Promise<string | null>((resolve) => setApproval({ message, resolve }));
  const askAgeCheck = (prompts: string[]) => new Promise<AgeDecision | null>((resolve) => setAgeGate({ prompts, resolve }));
  const sendSale = async (body: any) => {
    const res = await fetch('/api/admin/pos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, d };
  };
  // One retry after a manager PIN. Only asked once per attempt, so a wrong PIN can't loop.
  const postSale = async (body: any) => {
    const first = await sendSale({ ...body, registerId: register });
    if (first.ok || first.d?.code !== 'APPROVAL_REQUIRED') return first;
    const pin = await askApproval(first.d.error || 'Manager approval needed.');
    if (!pin) return { ok: false, status: 403, d: { error: 'Cancelled — no manager approval.' } };
    return sendSale({ ...body, registerId: register, approverPin: pin });
  };

  const submitSale = async () => {
    if (inFlight.current || !cart.length) return;     // client double-click lock
    if (cashShort || splitInvalid) return;
    if (payment === 'split' && !online) { showFlash({ kind: 'err', text: 'Split payments need a connection — take cash only while offline.' }); return; }
    const body: any = buildSaleBody();

    // Challenge 25: any age-restricted item needs an ID check (or a logged refusal) before payment.
    const restricted = cart.filter((l) => !!l.ageRestricted);
    if (restricted.length) {
      if (!online) { showFlash({ kind: 'err', text: 'Age-restricted items need a connection, so the ID check can be recorded. Reconnect to sell them.' }); return; }
      const prompts = restricted.map((l) => agePrompt(l.productKind || 'unclassified', parseMg(l.nicotineStrength), l.name));
      const decision = await askAgeCheck(prompts);
      if (!decision) return;   // cancelled at the till
      body.ageCheck = decision;
    }

    // Offline: queue cash sales locally; card/split must wait for the connection.
    if (!online) {
      if (payment !== 'cash') { showFlash({ kind: 'err', text: 'Offline — only cash sales can be queued. Reconnect to take card.' }); return; }
      setQueue((qq) => [...qq, { key: body.idempotencyKey, createdAt: Date.now(), total, body }]);
      showFlash({ kind: 'info', text: `Offline — sale of ${gbp(total)} saved and will sync when back online.` });
      resetBasket();
      return;
    }

    inFlight.current = true; setBusy(true);
    try {
      const { ok, d } = await postSale(body);
      if (!ok && d.code === 'AGE_REFUSED') { showFlash({ kind: 'err', text: 'Sale refused. The refusal has been recorded in the refusal log.' }); return; }
      if (!ok) { showFlash({ kind: 'err', text: d.error || 'Sale failed' }); if (d.code === 'NO_SHIFT') setCashRequest((n) => n + 1); return; }
      const change = d.change ? ` · change ${gbp(d.change)}` : '';
      showFlash({ kind: 'ok', text: `${d.duplicate ? 'Already recorded' : 'Sale recorded'} #${d.orderId} · ${gbp(d.total)}${change}`, receiptId: d.orderId });
      resetBasket();
      loadItems();
    } catch {
      showFlash({ kind: 'err', text: 'Network error — the sale was NOT recorded. Check the connection and try again (it is safe to retry).' });
    } finally {
      inFlight.current = false; setBusy(false);
    }
  };

  // Flush queued offline sales when we are online.
  const flushQueue = useCallback(async () => {
    const pending = readJSON<QueuedSale[]>(QUEUE_KEY, []);
    if (!pending.length || !navigator.onLine) return;
    const remaining: QueuedSale[] = [];
    let synced = 0;
    for (const s of pending) {
      try {
        const { ok, status, d } = await postSale(s.body);
        if (ok) { synced++; continue; }
        if (status === 409 || status === 400 || status === 403 || status === 422) remaining.push({ ...s, error: d.error || 'Rejected' });
        else remaining.push(s);
      } catch { remaining.push(s); }
    }
    setQueue(remaining);
    if (synced) { showFlash({ kind: 'ok', text: `${synced} offline sale${synced > 1 ? 's' : ''} synced.` }); loadItems(); }
  }, [loadItems, showFlash]);

  useEffect(() => {
    if (online) flushQueue();
  }, [online, flushQueue]);

  // ---- holds ---------------------------------------------------------------
  const holdBasket = async () => {
    if (!cart.length) return;
    const res = await fetch('/api/admin/pos/holds', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        items: cart.map((l) => ({ variantId: l.variantId, quantity: l.quantity, lineDiscountPct: l.lineDiscountPct, name: l.name, label: l.variantLabel, sku: l.sku })),
        discount: discountGbp, discountPct, note,
      }),
    });
    const d = await res.json();
    if (!res.ok) { showFlash({ kind: 'err', text: d.error || 'Could not hold basket' }); return; }
    showFlash({ kind: 'ok', text: `Basket held as ${d.hold.holdCode}` });
    resetBasket(); loadHolds();
  };

  const resumeHold = async (h: Hold) => {
    if (cart.length && !confirm('Replace the current basket with this held basket? (Hold the current one first to keep it.)')) return;
    const res = await fetch('/api/admin/pos/holds', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: h.id, action: 'resume' }) });
    const d = await res.json();
    if (!res.ok) { showFlash({ kind: 'err', text: d.error || 'Could not resume' }); loadHolds(); return; }
    const restored: CartLine[] = [];
    for (const it of h.items as any[]) {
      const live = items.find((i) => i.variantId === it.variantId);
      if (!live) continue;
      restored.push({ ...live, quantity: Math.min(it.quantity, live.stock), lineDiscountPct: Number(it.lineDiscountPct || 0) });
    }
    setCart(restored);
    setDiscountGbp(Number(h.discount || 0)); setDiscountPct(Number(h.discountPct || 0)); setNote(h.note || '');
    setMode('sale'); setShowHolds(false); idemKey.current = newKey();
    showFlash({ kind: 'info', text: `Resumed ${h.holdCode}${restored.length < h.items.length ? ' — some items are now out of stock and were removed' : ''}` });
    loadHolds();
  };

  const discardHold = async (h: Hold) => {
    if (!confirm(`Discard held basket ${h.holdCode}?`)) return;
    await fetch(`/api/admin/pos/holds?id=${h.id}`, { method: 'DELETE' });
    loadHolds();
  };

  // ---- returns -------------------------------------------------------------
  const loadOriginal = async () => {
    const id = Number(origId.replace(/[^0-9]/g, ''));
    if (!id) { showFlash({ kind: 'err', text: 'Enter the receipt number, e.g. 1234' }); return; }
    const res = await fetch(`/api/admin/pos/orders/${id}`);
    const d = await res.json();
    if (!res.ok) { showFlash({ kind: 'err', text: d.error || 'Sale not found' }); setOrigOrder(null); return; }
    setOrigOrder(d); setRetQty({});
  };

  const submitReturn = async () => {
    if (inFlight.current || !origOrder) return;
    const lines = origOrder.lines.filter((l) => l.variantId && (retQty[l.variantId] || 0) > 0);
    if (!lines.length) { showFlash({ kind: 'err', text: 'Choose the quantities being returned' }); return; }
    if (!retReason.trim()) { showFlash({ kind: 'err', text: 'Enter a reason for the return' }); return; }
    inFlight.current = true; setBusy(true);
    try {
      const body = {
        parentOrderId: origOrder.order.id,
        items: lines.map((l) => ({ variantId: l.variantId, quantity: retQty[l.variantId!] })),
        paymentMethod: retMethod, refundReason: retReason.trim(), refundReasonCode: retCode, resellable: retResellable, idempotencyKey: newKey(),
      };
      const { ok, d } = await postSale(body);
      if (!ok) { showFlash({ kind: 'err', text: d.error || 'Return failed' }); if (d.code === 'NO_SHIFT') setCashRequest((n) => n + 1); return; }
      showFlash({ kind: 'ok', text: `Return #${d.orderId} recorded · refunded ${gbp(d.refund)} (${retMethod})`, receiptId: d.orderId });
      setOrigOrder(null); setOrigId(''); setRetQty({}); setRetReason(''); setRetCode('changed_mind'); setRetResellable(true);
      loadItems();
    } finally { inFlight.current = false; setBusy(false); }
  };

  // ---- cash pad ------------------------------------------------------------
  const pad = (k: string) => {
    setTendered((t) => {
      if (k === '⌫') return t.slice(0, -1);
      if (k === '.') return t.includes('.') ? t : (t || '0') + '.';
      if (t.includes('.') && t.split('.')[1].length >= 2) return t;
      if (t === '0') return k;
      return (t + k).slice(0, 7);
    });
  };

  const breadcrumb = (
    <div className="flex flex-wrap items-center gap-2 text-sm mb-3">
      <button onClick={() => setDrill({ mode: 'cat' })} className={`px-3 py-2 rounded-lg font-bold ${drill.mode === 'cat' ? 'bg-amber-400 text-black' : 'text-zinc-300 hover:text-white'}`}>Categories</button>
      {drill.mode !== 'cat' && (<>
        <span className="text-zinc-600">›</span>
        <button onClick={() => setDrill({ mode: 'brand', category: drill.category })} className={`px-3 py-2 rounded-lg font-bold ${drill.mode === 'brand' ? 'bg-amber-400 text-black' : 'text-zinc-300 hover:text-white'}`}>{drill.category}</button>
      </>)}
      {drill.mode === 'variant' && (<>
        <span className="text-zinc-600">›</span>
        <span className="px-3 py-2 rounded-lg font-bold bg-amber-400 text-black">{drill.brand}</span>
      </>)}
    </div>
  );

  const tile = (v: VarItem, showFav = true) => {
    const inCart = cart.find((c) => c.variantId === v.variantId)?.quantity ?? 0;
    const disabled = v.stock - inCart <= 0;
    const isFav = favs.includes(v.variantId);
    return (
      <div key={v.variantId} className="relative">
        <button
          onClick={() => !disabled && mode === 'sale' && addToCart(v)}
          disabled={disabled || mode === 'return'}
          className={`w-full min-h-[132px] text-left rounded-2xl border p-3 bg-zinc-900 transition active:scale-[0.98] ${disabled ? 'opacity-40 cursor-not-allowed border-zinc-800' : 'border-zinc-800 hover:border-amber-400 hover:bg-zinc-800'}`}
        >
          <div className="h-20 w-full rounded-lg bg-zinc-800 overflow-hidden mb-2 flex items-center justify-center text-3xl">
            {v.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.image} alt="" className="h-full w-full object-contain" />
            ) : '☁️'}
          </div>
          <p className="text-[10px] font-bold uppercase text-amber-400 tracking-wide truncate">{v.brand}</p>
          <p className="text-sm font-bold text-white line-clamp-2 leading-tight">{v.name}</p>
          <p className="text-[11px] text-zinc-400 line-clamp-1">{v.variantLabel}</p>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-base font-extrabold text-white">{gbp(v.price)}</span>
            <span className={`text-[11px] font-bold ${v.stock < 5 ? 'text-red-400' : 'text-zinc-500'}`}>{v.stock}{inCart > 0 ? ` (-${inCart})` : ''}</span>
          </div>
        </button>
        {showFav && (
          <button onClick={() => toggleFav(v.variantId)} aria-label={isFav ? 'Remove favourite' : 'Add favourite'}
            className={`absolute right-2 top-2 h-9 w-9 rounded-full text-base ${isFav ? 'bg-amber-400 text-black' : 'bg-black/60 text-zinc-300'}`}>
            {isFav ? '★' : '☆'}
          </button>
        )}
      </div>
    );
  };

  // ---- render --------------------------------------------------------------
  return (
    <div className="space-y-3">
      <StaffBar register={register} onRegister={changeRegister} cashRequest={cashRequest} />
      {ageGate && (
        <AgeCheckModal prompts={ageGate.prompts} idTypes={ID_TYPES} reasons={REFUSAL_REASONS}
          onDecide={(d) => { ageGate.resolve(d); setAgeGate(null); }} />
      )}
      {approval && (
        <PinPad title="Manager approval" subtitle={approval.message} submitLabel="Approve"
          onCancel={() => { approval.resolve(null); setApproval(null); }}
          onSubmit={async (pin) => { approval.resolve(pin); setApproval(null); return null; }} />
      )}
      {/* Status bar */}
      {!online && (
        <div className="rounded-xl bg-red-500/20 border border-red-500/50 px-4 py-2 text-sm font-bold text-red-200">
          ⚠ Offline — cash sales are saved on this device and will sync when the connection returns. Card payments are paused.
        </div>
      )}
      {queue.length > 0 && (
        <div className="rounded-xl bg-amber-400/15 border border-amber-400/40 px-4 py-2 text-sm text-amber-100 flex flex-wrap items-center gap-3">
          <span className="font-bold">{queue.length} sale{queue.length > 1 ? 's' : ''} waiting to sync</span>
          {online && <button onClick={flushQueue} className="rounded-lg bg-amber-400 px-3 py-1 text-xs font-black text-black">Sync now</button>}
          {queue.filter((s) => s.error).length > 0 && (
            <span className="text-red-300 text-xs">{queue.filter((s) => s.error).length} rejected: {queue.find((s) => s.error)?.error}
              <button className="ml-2 underline" onClick={() => setQueue((qq) => qq.filter((s) => !s.error))}>discard rejected</button></span>
          )}
        </div>
      )}
      {flash && (
        <div className={`rounded-xl px-4 py-3 text-sm font-bold flex items-center gap-3 ${flash.kind === 'ok' ? 'bg-emerald-900/40 border border-emerald-500/40 text-emerald-200' : flash.kind === 'err' ? 'bg-red-900/40 border border-red-500/40 text-red-300' : 'bg-zinc-800 border border-zinc-600 text-zinc-200'}`}>
          <span className="flex-1">{flash.text}</span>
          {flash.receiptId && (<>
            <a href={`/admin/pos/receipt/${flash.receiptId}?print=1`} target="_blank" rel="noreferrer" className="rounded-lg bg-white/10 px-3 py-2 text-xs">🖨 Print</a>
            <Link href={`/admin/pos/receipt/${flash.receiptId}`} className="rounded-lg bg-white/10 px-3 py-2 text-xs">✉ Email</Link>
          </>)}
          <button onClick={() => setFlash(null)} className="text-zinc-400 hover:text-white px-2">✕</button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        {/* ---------- Product picker ---------- */}
        <div>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="text-xl font-extrabold text-white">🛒 Till</h2>
            <div className="ml-auto flex gap-2">
              <button onClick={() => setMode('sale')} className={`rounded-lg px-4 py-2 text-sm font-bold ${mode === 'sale' ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-300'}`}>Sale</button>
              <button onClick={() => setMode('return')} className={`rounded-lg px-4 py-2 text-sm font-bold ${mode === 'return' ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-300'}`}>Return / exchange</button>
              <Link href="/admin/orders" className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-white">Orders →</Link>
            </div>
          </div>

          {mode === 'sale' && (<>
            <input
              className="input mb-3 !text-lg !py-4"
              placeholder="🔍 Search name, brand, SKU or scan barcode…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || !q.trim()) return;
                const code = q.trim();
                if (byBarcode.has(code)) { e.preventDefault(); handleScan(code); setQ(''); }
              }}
              autoFocus
              autoComplete="off"
            />
            {favItems.length > 0 && !q && (
              <div className="mb-3">
                <p className="text-xs font-bold text-amber-300 mb-2">★ Favourites</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{favItems.map((v) => tile(v))}</div>
              </div>
            )}
            {!q && breadcrumb}
            <div className="max-h-[62vh] overflow-y-auto pr-1">
              {!q && drill.mode === 'cat' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {categories.map(([name, count]) => (
                    <button key={name} onClick={() => setDrill({ mode: 'brand', category: name })}
                      className="min-h-[120px] rounded-2xl border border-zinc-800 bg-zinc-900 hover:border-amber-400 hover:bg-zinc-800 active:scale-[0.98] transition p-5 text-left">
                      <div className="text-4xl mb-2">{categoryEmoji(name)}</div>
                      <p className="text-base font-extrabold text-white">{name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{count} item{count !== 1 ? 's' : ''} in stock</p>
                    </button>
                  ))}
                  {categories.length === 0 && <p className="col-span-full text-center text-zinc-500 py-10">No stock yet — add products first.</p>}
                </div>
              )}
              {!q && drill.mode === 'brand' && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {brands.map(([name, count]) => (
                    <button key={name} onClick={() => setDrill({ mode: 'variant', category: drill.category, brand: name })}
                      className="min-h-[96px] rounded-2xl border border-zinc-800 bg-zinc-900 hover:border-amber-400 hover:bg-zinc-800 active:scale-[0.98] transition p-5 text-left">
                      <p className="text-base font-extrabold text-white">{name}</p>
                      <p className="text-xs text-zinc-500 mt-0.5">{count} variant{count !== 1 ? 's' : ''}</p>
                    </button>
                  ))}
                  {brands.length === 0 && <p className="col-span-full text-center text-zinc-500 py-10">No brands in this category.</p>}
                </div>
              )}
              {(q || drill.mode === 'variant') && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {visibleProducts.map((v) => tile(v))}
                  {visibleProducts.length === 0 && <p className="col-span-full text-center text-zinc-500 py-10">{q ? `Nothing matches "${q}"` : 'No products match.'}</p>}
                </div>
              )}
            </div>
          </>)}

          {mode === 'return' && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
              <p className="text-sm text-zinc-300">Enter the original receipt number. Refunds are linked to that sale; for an exchange, complete the return here and then ring up the new items in Sale mode.</p>
              <div className="flex gap-2">
                <input className="input !text-lg !py-3 flex-1" placeholder="Receipt # e.g. 1234" value={origId} onChange={(e) => setOrigId(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadOriginal()} />
                <button onClick={loadOriginal} className="rounded-xl bg-zinc-700 px-5 font-bold text-white">Find sale</button>
              </div>
              {origOrder && (
                <>
                  <div className="text-sm text-zinc-300">Sale #{origOrder.order.id} · {new Date(origOrder.order.createdAt).toLocaleString('en-GB')} · {gbp(origOrder.order.total)}
                    {origOrder.returns.length > 0 && <span className="ml-2 text-amber-300">({origOrder.returns.length} return{origOrder.returns.length > 1 ? 's' : ''} already)</span>}
                  </div>
                  <ul className="divide-y divide-zinc-800">
                    {origOrder.lines.map((l) => (
                      <li key={l.variantId ?? l.sku} className="flex items-center gap-3 py-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{l.productName}</p>
                          <p className="text-xs text-zinc-400 truncate">{l.variantLabel} · sold {l.quantity} @ {gbp(l.unitPrice)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setRetQty((r) => ({ ...r, [l.variantId!]: Math.max(0, (r[l.variantId!] || 0) - 1) }))} className="h-11 w-11 rounded-lg bg-zinc-800 text-xl text-white">−</button>
                          <span className="w-8 text-center text-white font-bold">{retQty[l.variantId!] || 0}</span>
                          <button onClick={() => setRetQty((r) => ({ ...r, [l.variantId!]: Math.min(l.quantity, (r[l.variantId!] || 0) + 1) }))} className="h-11 w-11 rounded-lg bg-zinc-800 text-xl text-white">+</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <select className="input !text-sm" value={retCode} onChange={(e) => setRetCode(e.target.value)} aria-label="Refund reason">
                    <option value="changed_mind">Changed mind</option>
                    <option value="faulty">Faulty / not working</option>
                    <option value="damaged">Damaged</option>
                    <option value="wrong_item">Wrong item</option>
                    <option value="not_as_described">Not as described</option>
                    <option value="other">Other</option>
                  </select>
                  <input className="input !text-sm" placeholder="Reason for return (required) e.g. faulty coil" value={retReason} onChange={(e) => setRetReason(e.target.value)} />
                  <label className="flex items-center gap-3 rounded-xl bg-zinc-800 px-3 py-3 text-sm font-bold text-zinc-100"><input type="checkbox" className="h-5 w-5" checked={retResellable} onChange={(e) => setRetResellable(e.target.checked)} /> Goods are resellable (put back in stock)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button onClick={() => setRetMethod('cash')} className={`rounded-xl py-3 font-bold ${retMethod === 'cash' ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-300'}`}>Refund cash</button>
                    <button onClick={() => setRetMethod('card')} className={`rounded-xl py-3 font-bold ${retMethod === 'card' ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-300'}`}>Refund card (manual)</button>
                  </div>
                  <button onClick={submitReturn} disabled={busy} className="w-full rounded-xl bg-red-500 py-4 text-base font-black text-white disabled:opacity-50">{busy ? 'Recording…' : 'Record return & refund'}</button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ---------- Basket ---------- */}
        <aside className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 h-fit lg:sticky lg:top-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-extrabold text-white">🧾 Basket ({itemCount})</h3>
            <button onClick={() => { setShowHolds((s) => !s); loadHolds(); }} className="ml-auto rounded-lg bg-zinc-800 px-3 py-2 text-xs font-bold text-zinc-200">⏸ Held ({holds.length})</button>
          </div>

          {showHolds && (
            <div className="mt-3 rounded-xl border border-zinc-700 bg-zinc-950 p-3 space-y-2">
              {holds.length === 0 && <p className="text-xs text-zinc-500">No held baskets.</p>}
              {holds.map((h) => (
                <div key={h.id} className="flex items-center gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white">{h.holdCode} <span className="text-xs text-zinc-500">· {new Date(h.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></p>
                    <p className="text-xs text-zinc-400 truncate">{h.items.length} line{h.items.length !== 1 ? 's' : ''}{h.note ? ` · ${h.note}` : ''}</p>
                  </div>
                  <button onClick={() => resumeHold(h)} className="rounded-lg bg-amber-400 px-3 py-2 text-xs font-black text-black">Resume</button>
                  <button onClick={() => discardHold(h)} className="rounded-lg px-2 py-2 text-xs text-red-400">✕</button>
                </div>
              ))}
            </div>
          )}

          {mode === 'return' ? (
            <p className="text-sm text-zinc-500 mt-3">Return mode — the basket is paused. Switch to Sale to ring up items.</p>
          ) : cart.length === 0 ? (
            <p className="text-sm text-zinc-500 mt-3">Tap a product or scan a barcode to add it. Tap ☆ on a product to pin it to Favourites.</p>
          ) : (
            <>
              <ul className="mt-3 divide-y divide-zinc-800 max-h-[36vh] overflow-y-auto">
                {cart.map((l) => (
                  <li key={l.variantId} className="py-2 space-y-1">
                    <div className="flex gap-2 items-start">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-white truncate">{l.name}</p>
                        <p className="text-[11px] text-zinc-400 truncate">{l.variantLabel}</p>
                        <p className="text-[11px] text-amber-400">{gbp(l.price)} each{l.lineDiscountPct > 0 ? ` · −${l.lineDiscountPct}%` : ''}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => changeQty(l.variantId, -1)} className="h-10 w-10 rounded-lg bg-zinc-800 text-white text-lg">−</button>
                        <span className="w-7 text-center text-white font-bold">{l.quantity}</span>
                        <button onClick={() => changeQty(l.variantId, 1)} className="h-10 w-10 rounded-lg bg-zinc-800 text-white text-lg">+</button>
                      </div>
                      <div className="w-16 text-right text-white font-bold text-sm pt-2">{gbp(l.price * l.quantity * (1 - l.lineDiscountPct / 100))}</div>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                      <span>Line discount %</span>
                      <input type="number" min={0} max={100} value={l.lineDiscountPct || ''} placeholder="0"
                        onChange={(e) => setLineDisc(l.variantId, Number(e.target.value) || 0)}
                        className="w-16 rounded bg-zinc-800 border border-zinc-700 px-2 py-1 text-right text-white text-xs" />
                    </div>
                  </li>
                ))}
              </ul>

              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between text-zinc-400"><span>Subtotal</span><span>{gbp(gross)}</span></div>
                <div className="flex justify-between items-center text-zinc-400 gap-2">
                  <span>Basket discount</span>
                  <div className="flex items-center gap-1">
                    <input type="number" min={0} max={100} step="1" value={discountPct || ''} placeholder="0" onChange={(e) => setDiscountPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                      className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-right text-white text-sm" /><span className="text-xs">%</span>
                    <span className="text-xs">or £</span>
                    <input type="number" min={0} step="0.01" value={discountGbp || ''} placeholder="0" onChange={(e) => setDiscountGbp(Number(e.target.value) || 0)}
                      className="w-20 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-right text-white text-sm" />
                  </div>
                </div>
                {totalDisc > 0 && <div className="flex justify-between text-xs text-zinc-500"><span>Total discount</span><span>−{gbp(totalDisc)}</span></div>}
                {overCap && <p className="text-xs font-bold text-red-400">Discount {discountPctOfGross.toFixed(1)}% is above your {discountCap}% limit — a manager PIN will be asked PIN will be asked.</p>}
                <div className="flex justify-between text-white font-extrabold text-2xl pt-2 border-t border-zinc-800">
                  <span>Total</span><span>{gbp(total)}</span>
                </div>
              </div>

              {/* Payment */}
              <div className="mt-4">
                <p className="text-xs text-zinc-400 mb-2 font-semibold">Payment</p>
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={() => setPayment('cash')} className={`min-h-[52px] rounded-xl font-bold text-sm ${payment === 'cash' ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-300'}`}>💵 Cash</button>
                  <button onClick={() => setPayment('card')} className={`min-h-[52px] rounded-xl font-bold text-sm ${payment === 'card' ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-300'}`}>💳 Card</button>
                  <button onClick={() => online && setPayment('split')} disabled={!online} className={`min-h-[52px] rounded-xl font-bold text-sm disabled:opacity-40 ${payment === 'split' ? 'bg-amber-400 text-black' : 'bg-zinc-800 text-zinc-300'}`}>✂ Split</button>
                </div>

                {payment === 'card' && (
                  <div className="mt-2 space-y-2">
                    <div className="rounded-xl border border-zinc-700 bg-zinc-950 p-3 text-xs text-zinc-300">
                      Take the <b>{gbp(total)}</b> payment on your card terminal first, then record it here. This records the payment only — it does not charge the card.
                    </div>
                    <button disabled className="w-full rounded-xl border border-dashed border-zinc-700 py-2 text-xs text-zinc-600 cursor-not-allowed">Integrated terminal — coming soon</button>
                  </div>
                )}

                {payment === 'split' && (
                  <div className="mt-2 rounded-xl border border-zinc-700 bg-zinc-950 p-3 space-y-2">
                    <label className="flex items-center justify-between text-sm text-zinc-300 gap-2">
                      <span>Cash part £</span>
                      <input type="number" min={0} step="0.01" value={splitCash} onChange={(e) => setSplitCash(e.target.value)} className="w-28 bg-zinc-800 border border-zinc-700 rounded px-2 py-2 text-right text-white" />
                    </label>
                    <div className="flex justify-between text-sm text-zinc-300"><span>Card part (recorded)</span><span>{gbp(splitCardNum)}</span></div>
                    {splitInvalid && <p className="text-xs text-red-400">Enter a cash amount greater than £0 and less than the total.</p>}
                  </div>
                )}

                {(payment === 'cash' || payment === 'split') && (
                  <button onClick={() => setShowCashModal(true)} className="mt-2 w-full rounded-xl border border-white/20 py-3 text-sm font-bold text-white hover:bg-white/5">
                    {tendered ? `Cash received ${gbp(tenderedNum)}${changeDue > 0 ? ` · change ${gbp(changeDue)}` : ''}` : 'Enter cash received (for change)'}
                  </button>
                )}
              </div>

              <input className="input mt-3 text-sm !bg-zinc-800 !border-zinc-700 !text-white" placeholder="Staff note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

              <button onClick={submitSale}
                disabled={busy || cashShort || splitInvalid}
                className="w-full mt-4 rounded-xl bg-amber-400 hover:bg-amber-300 disabled:opacity-40 text-black font-black py-5 text-lg">
                {busy ? 'Recording…' : !online && payment === 'cash' ? `Queue cash sale · ${gbp(total)}` : `✓ Complete ${payment === 'card' ? 'card' : payment === 'split' ? 'split' : 'cash'} sale · ${gbp(total)}`}
              </button>
              {cashShort && <p className="mt-1 text-xs text-red-400 text-center">Cash received is less than the total.</p>}
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button onClick={holdBasket} className="rounded-lg bg-zinc-800 py-2 text-xs font-bold text-zinc-200">⏸ Hold basket</button>
                <button onClick={() => { if (confirm('Clear the basket?')) resetBasket(); }} className="rounded-lg bg-zinc-800 py-2 text-xs font-bold text-zinc-400">Clear basket</button>
              </div>
            </>
          )}
        </aside>
      </div>

      {/* ---------- Cash pad modal ---------- */}
      {showCashModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => setShowCashModal(false)}>
          <div className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-zinc-400">{payment === 'split' ? 'Cash part due' : 'Total due'}</p>
            <p className="text-3xl font-extrabold text-white">{gbp(cashDue)}</p>
            <div className="mt-3 rounded-xl bg-zinc-950 p-3 text-right">
              <p className="text-xs text-zinc-500">Cash received</p>
              <p className="text-3xl font-extrabold text-amber-300">£{tendered || '0.00'}</p>
            </div>
            <div className="mt-2 flex gap-2">
              {CASH_QUICK.map((n) => (
                <button key={n} onClick={() => setTendered(String(n))} className="flex-1 rounded-lg bg-zinc-800 py-2 text-sm font-bold text-white">£{n}</button>
              ))}
              <button onClick={() => setTendered(cashDue.toFixed(2))} className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-bold text-white">Exact</button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((k) => (
                <button key={k} onClick={() => pad(k)} className="h-16 rounded-xl bg-zinc-800 text-2xl font-bold text-white active:bg-zinc-700">{k}</button>
              ))}
            </div>
            <div className="mt-4 rounded-xl bg-emerald-900/30 border border-emerald-500/30 p-3 flex justify-between items-center">
              <span className="text-sm text-emerald-200">Change due</span>
              <span className="text-2xl font-extrabold text-emerald-300">{gbp(payment === 'cash' ? changeDue : Math.max(0, tenderedNum - cashDue))}</span>
            </div>
            {cashShort && <p className="mt-2 text-xs text-red-400">Less than due — {gbp(total - tenderedNum)} still owed.</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button onClick={() => { setTendered(''); }} className="rounded-xl bg-zinc-800 py-3 font-bold text-zinc-300">Clear</button>
              <button onClick={() => setShowCashModal(false)} className="rounded-xl bg-amber-400 py-3 font-black text-black">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function categoryEmoji(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('e-liquid') || n.includes('eliquid') || n.includes('liquid')) return '🧴';
  if (n.includes('pod')) return '🔋';
  if (n.includes('mod') || n.includes('kit')) return '⚡';
  if (n.includes('coil') || n.includes('tank')) return '🌀';
  if (n.includes('batter')) return '🔌';
  if (n.includes('accessor')) return '🎒';
  if (n.includes('mobile') || n.includes('phone') || n.includes('repair')) return '📱';
  if (n.includes('dispos')) return '🚭';
  return '📦';
}
