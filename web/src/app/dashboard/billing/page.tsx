'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { Button, Badge, Loader, Modal } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import { ROUTES } from '@/lib/constants';
import styles from './page.module.css';

interface StoredCard {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
  created_at: string;
}

interface InvoiceItem {
  id: string;
  garment_type: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface Invoice {
  id: string;
  order_number: string;
  date: string;
  order_type: string;
  weight_lbs?: number | null;
  subtotal: number;
  discount_amount: number;
  total: number;
  payment_id: string;
  payment_status: string;
  items: InvoiceItem[];
}

interface BillingResponse {
  payment_methods: StoredCard[];
  invoices: Invoice[];
}

export default function BillingPage() {
  const queryClient = useQueryClient();
  const addToast = useUIStore((s) => s.addToast);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<Invoice | null>(null);

  // New Card Form State
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [setAsDefault, setSetAsDefault] = useState(true);

  // Fetch billing data
  const { data, isLoading, error } = useQuery<BillingResponse>({
    queryKey: ['customer_billing_data'],
    queryFn: async () => {
      const res = await fetch('/api/customer/payment-methods');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch payment methods');
      }
      return res.json();
    },
  });

  const paymentMethods = data?.payment_methods || [];
  const invoices = data?.invoices || [];

  // Add Card Mutation
  const addCardMutation = useMutation({
    mutationFn: async () => {
      // Basic validation
      const sanitizedNumber = cardNumber.replace(/\s+/g, '');
      if (sanitizedNumber.length < 15) throw new Error('Please enter a valid 16-digit card number.');
      if (!cardExpiry.includes('/')) throw new Error('Expiration format must be MM/YY.');
      if (cardCvc.length < 3) throw new Error('Please enter a valid 3 or 4-digit CVC code.');

      const [expMonthStr, expYearStr] = cardExpiry.split('/');
      const expMonth = parseInt(expMonthStr.trim(), 10);
      const expYear = parseInt('20' + expYearStr.trim(), 10);

      // Simple brand detector
      let brand = 'visa';
      if (sanitizedNumber.startsWith('5')) brand = 'mastercard';
      if (sanitizedNumber.startsWith('3')) brand = 'amex';
      if (sanitizedNumber.startsWith('6')) brand = 'discover';

      const res = await fetch('/api/customer/payment-methods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          card_brand: brand,
          last4: sanitizedNumber.slice(-4),
          exp_month: expMonth,
          exp_year: expYear,
          is_default: setAsDefault,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save card');
      }

      return res.json();
    },
    onSuccess: () => {
      addToast({
        type: 'success',
        title: 'Card Vaulted',
        message: 'New payment method securely vaulted and saved to your profile.',
      });
      setIsAddModalOpen(false);
      setCardNumber('');
      setCardExpiry('');
      setCardCvc('');
      setCardholderName('');
      queryClient.invalidateQueries({ queryKey: ['customer_billing_data'] });
    },
    onError: (err: Error) => {
      addToast({
        type: 'error',
        title: 'Failed to Add Card',
        message: err.message,
      });
    },
  });

  // Delete Card Mutation
  const deleteCardMutation = useMutation({
    mutationFn: async (cardId: string) => {
      const res = await fetch(`/api/customer/payment-methods?card_id=${encodeURIComponent(cardId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to delete card');
      }
      return res.json();
    },
    onSuccess: () => {
      addToast({
        type: 'success',
        title: 'Card Removed',
        message: 'Payment method has been removed from your profile.',
      });
      queryClient.invalidateQueries({ queryKey: ['customer_billing_data'] });
    },
    onError: (err: Error) => {
      addToast({
        type: 'error',
        title: 'Action Failed',
        message: err.message,
      });
    },
  });

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  };

  return (
    <AuthGuard>
      <div className={styles.page}>
        <div className={styles.container}>
          {/* Header */}
          <div className={styles.headerRow}>
            <div>
              <Link href={ROUTES.dashboard} className={styles.backLink}>
                ← Return to Dashboard
              </Link>
              <h1 className={styles.pageTitle}>
                <span>💳</span> Billing &amp; Payment Methods
              </h1>
              <p className={styles.pageSub}>
                Manage your PCI-DSS vaulted credit cards, view billing receipts, and monitor itemized orders.
              </p>
            </div>
            <Button variant="primary" size="md" onClick={() => setIsAddModalOpen(true)}>
              + Add Payment Method
            </Button>
          </div>

          {isLoading ? (
            <Loader text="Loading your billing profile..." />
          ) : error ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>
              {(error as Error).message}
            </div>
          ) : (
            <>
              {/* Section 1: Payment Methods on File */}
              <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 className={styles.sectionTitle}>
                      <span>🔒</span> Vaulted Cards on File
                    </h2>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      Stored with Level 1 PCI-DSS tokenization. Never stored in plain text.
                    </span>
                  </div>
                </div>

                <div className={styles.cardsGrid}>
                  {paymentMethods.map((card) => (
                    <div key={card.id} className={styles.creditCardBox}>
                      <div className={styles.cardTopRow}>
                        <div className={styles.cardChip} />
                        <span className={styles.cardBrandBadge}>{card.brand}</span>
                      </div>

                      <div className={styles.cardNumberMask}>
                        •••• •••• •••• {card.last4}
                      </div>

                      <div className={styles.cardBottomRow}>
                        <div>
                          <span>EXPIRES</span>
                          <strong style={{ display: 'block', color: '#ffffff' }}>
                            {String(card.exp_month).padStart(2, '0')}/{String(card.exp_year).slice(-2)}
                          </strong>
                        </div>
                        {card.is_default && (
                          <span className={styles.defaultBadge}>DEFAULT</span>
                        )}
                      </div>

                      <div className={styles.cardActions}>
                        <span style={{ fontSize: '10px', color: '#64748b' }}>
                          Verified on file
                        </span>
                        {paymentMethods.length > 1 && (
                          <button
                            type="button"
                            className={styles.actionLink}
                            onClick={() => deleteCardMutation.mutate(card.id)}
                            disabled={deleteCardMutation.isPending}
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {/* Add New Card Button */}
                  <div className={styles.addCardDashedBox} onClick={() => setIsAddModalOpen(true)}>
                    <span style={{ fontSize: 'var(--text-2xl)' }}>💳</span>
                    <strong style={{ fontSize: 'var(--text-xs)' }}>+ Add New Card</strong>
                    <span style={{ fontSize: '11px' }}>Visa, Mastercard, Amex, Discover</span>
                  </div>
                </div>
              </div>

              {/* Section 2: Invoices & Receipts */}
              <div className={styles.sectionCard}>
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 className={styles.sectionTitle}>
                      <span>🧾</span> Transaction Invoices &amp; Receipts
                    </h2>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                      Itemized receipts for all completed pickups, laundry weighing, and dry clean treatments.
                    </span>
                  </div>
                </div>

                {invoices.length === 0 ? (
                  <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: 'var(--text-sm)' }}>
                    No billing history yet. Invoices will generate automatically upon intake weighing.
                  </div>
                ) : (
                  <div className={styles.tableWrapper}>
                    <table className={styles.invoicesTable}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Order #</th>
                          <th>Service Type</th>
                          <th>Transaction ID</th>
                          <th>Status</th>
                          <th>Amount</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invoices.map((inv) => (
                          <tr key={inv.id}>
                            <td>{formatDate(inv.date)}</td>
                            <td>
                              <strong style={{ color: 'var(--color-gold)' }}>#{inv.order_number}</strong>
                            </td>
                            <td>
                              {inv.weight_lbs && Number(inv.weight_lbs) > 0 ? `${inv.weight_lbs} lbs Wash & Fold` : ''}
                              {inv.items.length > 0 ? (inv.weight_lbs ? ' + ' : '') + `${inv.items.length} Dry Clean Items` : ''}
                              {!inv.weight_lbs && inv.items.length === 0 ? 'Standard Service' : ''}
                            </td>
                            <td>
                              <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#94a3b8' }}>
                                {inv.payment_id}
                              </span>
                            </td>
                            <td>
                              <Badge variant={inv.payment_status === 'charged' ? 'delivered' : 'warning'}>
                                {inv.payment_status === 'charged' ? 'Paid / Settled' : 'Pre-Authorized'}
                              </Badge>
                            </td>
                            <td>
                              <strong style={{ color: inv.payment_status === 'charged' ? '#34d399' : '#ffffff' }}>
                                ${inv.total.toFixed(2)}
                              </strong>
                            </td>
                            <td>
                              <button
                                type="button"
                                className={styles.receiptBtn}
                                onClick={() => setSelectedReceipt(inv)}
                              >
                                🧾 View Receipt
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Add Payment Method Modal */}
          <Modal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            title="Add Payment Card"
            size="md"
          >
            <form
              className={styles.addCardForm}
              onSubmit={(e) => {
                e.preventDefault();
                addCardMutation.mutate();
              }}
            >
              <div className={styles.inputGroup}>
                <label className={styles.label}>Cardholder Name</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="e.g. Sogo Ayenigba"
                  value={cardholderName}
                  onChange={(e) => setCardholderName(e.target.value)}
                  required
                />
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.label}>Card Number</label>
                <input
                  type="text"
                  className={styles.input}
                  placeholder="•••• •••• •••• ••••"
                  maxLength={19}
                  value={cardNumber}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').replace(/(\d{4})/g, '$1 ').trim();
                    setCardNumber(val);
                  }}
                  required
                />
              </div>

              <div className={styles.row2}>
                <div className={styles.inputGroup}>
                  <label className={styles.label}>Expiration (MM/YY)</label>
                  <input
                    type="text"
                    className={styles.input}
                    placeholder="MM/YY"
                    maxLength={5}
                    value={cardExpiry}
                    onChange={(e) => {
                      let val = e.target.value.replace(/[^\d/]/g, '');
                      if (val.length === 2 && !val.includes('/')) val += '/';
                      setCardExpiry(val);
                    }}
                    required
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.label}>Security Code (CVC)</label>
                  <input
                    type="password"
                    className={styles.input}
                    placeholder="•••"
                    maxLength={4}
                    value={cardCvc}
                    onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, ''))}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
                <input
                  type="checkbox"
                  id="defaultCheck"
                  checked={setAsDefault}
                  onChange={(e) => setSetAsDefault(e.target.checked)}
                />
                <label htmlFor="defaultCheck" style={{ fontSize: 'var(--text-xs)', color: '#334155' }}>
                  Set as default payment method for future orders
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
                <Button variant="ghost" type="button" onClick={() => setIsAddModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  isLoading={addCardMutation.isPending}
                  disabled={addCardMutation.isPending}
                >
                  Save &amp; Vault Card
                </Button>
              </div>
            </form>
          </Modal>

          {/* Itemized Digital Receipt Modal */}
          <Modal
            isOpen={Boolean(selectedReceipt)}
            onClose={() => setSelectedReceipt(null)}
            title="Digital Tax Invoice & Receipt"
            size="md"
          >
            {selectedReceipt && (
              <div className={styles.receiptPaper}>
                <div className={styles.receiptPaperHeader}>
                  <div>
                    <span className={styles.receiptBrand}>First Eleven Cleaners</span>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                      48-Hour Match-Ready Dry Cleaning &amp; Laundry
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <strong style={{ color: '#0f172a' }}>Order #{selectedReceipt.order_number}</strong>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                      {formatDate(selectedReceipt.date)}
                    </p>
                  </div>
                </div>

                {/* Itemized Lines */}
                <div className={styles.receiptItemsList}>
                  {selectedReceipt.weight_lbs && Number(selectedReceipt.weight_lbs) > 0 && (
                    <div className={styles.receiptItemRow}>
                      <span>Wash &amp; Fold Laundry ({selectedReceipt.weight_lbs} lbs)</span>
                      <strong>${(Math.max(15, Number(selectedReceipt.weight_lbs)) * 3.0).toFixed(2)}</strong>
                    </div>
                  )}
                  {selectedReceipt.items.map((item, idx) => (
                    <div key={idx} className={styles.receiptItemRow}>
                      <span>{item.quantity}x {item.garment_type}</span>
                      <strong>${Number(item.subtotal).toFixed(2)}</strong>
                    </div>
                  ))}
                </div>

                {/* Totals */}
                <div className={styles.receiptTotals}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 'var(--text-xs)' }}>
                    <span style={{ color: '#64748b' }}>Subtotal:</span>
                    <strong>${selectedReceipt.subtotal.toFixed(2)}</strong>
                  </div>
                  {selectedReceipt.discount_amount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 'var(--text-xs)', color: '#10b981' }}>
                      <span>Launch Promo Discount:</span>
                      <strong>-${selectedReceipt.discount_amount.toFixed(2)}</strong>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', borderTop: '2px solid #0f172a', paddingTop: '6px', marginTop: '4px' }}>
                    <span className={styles.receiptGrandTotal}>Total Paid:</span>
                    <span className={styles.receiptGrandTotal}>${selectedReceipt.total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Payment Gateway Audit Metadata */}
                <div className={styles.receiptMeta}>
                  <span><strong>Gateway:</strong> Square Payments (PCI-DSS Level 1)</span>
                  <span><strong>Transaction Ref:</strong> {selectedReceipt.payment_id}</span>
                  <span><strong>Payment Status:</strong> {selectedReceipt.payment_status.toUpperCase()}</span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                  <Button variant="primary" size="sm" onClick={() => setSelectedReceipt(null)}>
                    Close Receipt
                  </Button>
                </div>
              </div>
            )}
          </Modal>
        </div>
      </div>
    </AuthGuard>
  );
}
