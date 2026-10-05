// ---------------------------------------------------------------------------
// Test double for the create_booking database function (P03 PR-10/11).
// It replays the function's writes through a test's own fake `from()` builders
// (orders -> order_items -> order_events), so each test's insert recording and
// failure injection keep working. Any failed write returns an error, as the
// real function rolls the whole booking back.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type Result = { data: unknown; error: unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FromFn = (table: string) => any;

export interface FakeCreateBookingOptions {
  /** Return false to simulate a promo code at its usage limit when the use is reserved. */
  reservePromo?: (code: string) => boolean;
  /** Return a refusal ('window_full', 'express_full', 'promo_used') to simulate a check failing under the lock. */
  refuse?: (p: Row) => string | null;
  /** Handles any other rpc name. */
  otherRpc?: (fn: string, args: Row) => Promise<Result>;
}

export function fakeRpc(from: FromFn, opts: FakeCreateBookingOptions = {}) {
  return async (fn: string, args: Row): Promise<Result> => {
    if (fn !== 'create_booking') {
      return opts.otherRpc ? opts.otherRpc(fn, args) : { data: null, error: null };
    }
    const p = args.p as Row;
    const order = p.order as Row;

    const refusal = opts.refuse?.(p);
    if (refusal) return { data: { ok: false, error: refusal }, error: null };
    if (p.reserve_promo && order.promo_code && opts.reservePromo && !opts.reservePromo(String(order.promo_code))) {
      return { data: { ok: false, error: 'promo_exhausted' }, error: null };
    }

    const inserted = await from('orders')
      .insert({ ...order, status: 'booked', idempotency_key: p.idempotency_key ?? null })
      .select('id, order_number, total, status, customer_id')
      .single();
    if (inserted.error || !inserted.data) return { data: null, error: inserted.error || { message: 'no order' } };
    const saved = inserted.data as Row;

    const items = (p.items as Row[]) || [];
    if (items.length > 0) {
      const { error } = await from('order_items').insert(items.map((i) => ({ order_id: saved.id, ...i })));
      if (error) return { data: null, error };
    }
    const event = (p.event as Row) || {};
    const { error: eventErr } = await from('order_events').insert({
      order_id: saved.id,
      status: 'booked',
      note: event.note,
      triggered_by: event.triggered_by,
    });
    if (eventErr) return { data: null, error: eventErr };

    return {
      data: {
        ok: true,
        replay: false,
        order: { id: saved.id, order_number: saved.order_number, total: saved.total, status: 'booked', customer_id: saved.customer_id },
      },
      error: null,
    };
  };
}
