'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { Badge, Loader, Modal, Button } from '@/components/ui';
import styles from './FinancialsLedger.module.css';

interface OrderItem {
  id: string;
  garment_type: string;
  service_type: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface FinancialTransaction {
  id: string;
  order_number: string;
  customer?: {
    id: string;
    full_name: string;
    email: string;
    phone: string;
  };
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  order_type: string;
  weight_lbs?: number | null;
  subtotal: number;
  discount_amount: number;
  total: number;
  payment_id: string;
  payment_status: 'pending' | 'authorized' | 'charged' | 'failed' | 'refunded';
  payment_date: string;
  charge_note?: string | null;
  items: OrderItem[];
  created_at: string;
  updated_at: string;
}

interface FinancialsResponse {
  summary: {
    gross_revenue: number;
    in_vault: number;
    aov: number;
    total_transactions: number;
    charged_count: number;
    authorized_count: number;
    failed_count: number;
    refunded_count: number;
  };
  transactions: FinancialTransaction[];
}

export function FinancialsLedger() {
  const [filter, setFilter] = useState<'all' | 'charged' | 'authorized' | 'failed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<FinancialTransaction | null>(null);

  const { data, isLoading, error, refetch } = useQuery<FinancialsResponse>({
    queryKey: ['mission_control_financials'],
    queryFn: async () => {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (sessionData?.session?.access_token) {
        headers['Authorization'] = `Bearer ${sessionData.session.access_token}`;
      }

      const res = await fetch('/api/mission-control/financials', { headers });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch financial records');
      }
      return res.json();
    },
    refetchInterval: 15000,
  });

  const summary = data?.summary || {
    gross_revenue: 0,
    in_vault: 0,
    aov: 0,
    total_transactions: 0,
    charged_count: 0,
    authorized_count: 0,
    failed_count: 0,
    refunded_count: 0,
  };

  const transactions = data?.transactions || [];

  const filteredTransactions = transactions.filter((t) => {
    // Status Filter
    if (filter === 'charged' && t.payment_status !== 'charged') return false;
    if (filter === 'authorized' && t.payment_status !== 'authorized' && t.payment_status !== 'pending') return false;
    if (filter === 'failed' && t.payment_status !== 'failed' && t.payment_status !== 'refunded') return false;

    // Search Query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchesNum = t.order_number.toLowerCase().includes(query);
      const matchesCustomer = (t.customer?.full_name || '').toLowerCase().includes(query);
      const matchesEmail = (t.customer?.email || '').toLowerCase().includes(query);
      const matchesTxn = (t.payment_id || '').toLowerCase().includes(query);
      return matchesNum || matchesCustomer || matchesEmail || matchesTxn;
    }

    return true;
  });

  const formatDateTime = (dateStr: string) => {
    if (!dateStr) return '—';
    const dateObj = new Date(dateStr);
    if (isNaN(dateObj.getTime())) return dateStr;
    return (
      dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' • ' +
      dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
    );
  };

  return (
    <div className={styles.ledgerContainer}>
      {/* KPI Overview Strip */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>💰 Gross Settled Revenue</span>
          <span className={styles.kpiValue} style={{ color: '#10b981' }}>
            ${summary.gross_revenue.toFixed(2)}
          </span>
          <span className={styles.kpiSubtext}>
            ✓ {summary.charged_count} settled transactions
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>⏳ In Vault (Pre-Authorized)</span>
          <span className={styles.kpiValue} style={{ color: '#f59e0b' }}>
            ${summary.in_vault.toFixed(2)}
          </span>
          <span className={styles.kpiSubtext} style={{ color: '#f59e0b' }}>
            {summary.authorized_count} awaiting intake weighing
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>📈 Average Order Value</span>
          <span className={styles.kpiValue} style={{ color: 'var(--color-gold)' }}>
            ${summary.aov.toFixed(2)}
          </span>
          <span className={styles.kpiSubtext} style={{ color: '#cbd5e1' }}>
            Across all fulfilled orders
          </span>
        </div>

        <div className={styles.kpiCard}>
          <span className={styles.kpiLabel}>🧾 Processed Volume</span>
          <span className={styles.kpiValue}>
            {summary.total_transactions}
          </span>
          <span className={styles.kpiSubtext} style={{ color: '#38bdf8' }}>
            Live Square & vaulted cards
          </span>
        </div>
      </div>

      {/* Main Ledger Card */}
      <div className={styles.ledgerCard}>
        <div className={styles.ledgerHeader}>
          <div>
            <h2 className={styles.ledgerTitle}>
              <span>💳</span> Financial Transactions &amp; Audit Ledger
            </h2>
            <p style={{ fontSize: 'var(--text-xs)', color: '#94a3b8', margin: '4px 0 0' }}>
              Real-time payment settlements, pre-authorizations, and Square gateway transaction references.
            </p>
          </div>
          <button
            type="button"
            className={styles.receiptBtn}
            onClick={() => refetch()}
          >
            🔄 Refresh Ledger
          </button>
        </div>

        {/* Controls: Filters and Search */}
        <div className={styles.controlsRow}>
          <div className={styles.filterTabs}>
            <button
              type="button"
              className={`${styles.filterBtn} ${filter === 'all' ? styles.filterBtnActive : ''}`}
              onClick={() => setFilter('all')}
            >
              All ({transactions.length})
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${filter === 'charged' ? styles.filterBtnActive : ''}`}
              onClick={() => setFilter('charged')}
            >
              Settled (${summary.gross_revenue.toFixed(0)})
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${filter === 'authorized' ? styles.filterBtnActive : ''}`}
              onClick={() => setFilter('authorized')}
            >
              In Vault ({summary.authorized_count})
            </button>
            <button
              type="button"
              className={`${styles.filterBtn} ${filter === 'failed' ? styles.filterBtnActive : ''}`}
              onClick={() => setFilter('failed')}
            >
              Failed / Refunded ({summary.failed_count + summary.refunded_count})
            </button>
          </div>

          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search Order #, Customer, or Txn ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Transactions Table */}
        {isLoading ? (
          <Loader text="Loading live financial ledger..." />
        ) : error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>
            {(error as Error).message}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
            No transaction records found matching the current filters.
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.ledgerTable}>
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Order #</th>
                  <th>Customer</th>
                  <th>Service Details</th>
                  <th>Gateway Ref</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Receipt</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{formatDateTime(tx.payment_date)}</td>
                    <td>
                      <strong style={{ color: 'var(--color-gold)' }}>#{tx.order_number}</strong>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{tx.customer?.full_name || 'Customer'}</div>
                      <div style={{ fontSize: '11px', color: '#94a3b8' }}>{tx.customer?.email || '—'}</div>
                    </td>
                    <td>
                      {tx.weight_lbs && Number(tx.weight_lbs) > 0 ? `${tx.weight_lbs} lbs Wash & Fold` : ''}
                      {tx.items.length > 0 ? (tx.weight_lbs ? ' + ' : '') + `${tx.items.length} Dry Clean` : ''}
                      {!tx.weight_lbs && tx.items.length === 0 ? 'Standard Service' : ''}
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontSize: '11px', color: '#cbd5e1' }}>
                        {tx.payment_id}
                      </span>
                    </td>
                    <td>
                      {tx.payment_status === 'charged' ? (
                        <Badge variant="delivered">Paid / Settled</Badge>
                      ) : tx.payment_status === 'authorized' ? (
                        <Badge variant="warning">In Vault (Auth)</Badge>
                      ) : (
                        <Badge variant="cleaning">{tx.payment_status}</Badge>
                      )}
                    </td>
                    <td>
                      <strong style={{ fontSize: 'var(--text-sm)', color: tx.payment_status === 'charged' ? '#34d399' : '#ffffff' }}>
                        ${tx.total.toFixed(2)}
                      </strong>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={styles.receiptBtn}
                        onClick={() => setSelectedReceipt(tx)}
                      >
                        🧾 Receipt
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
                  Dallas-Fort Worth Commercial Plant Operations
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <strong style={{ color: '#0f172a' }}>Order #{selectedReceipt.order_number}</strong>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#64748b' }}>
                  {formatDateTime(selectedReceipt.payment_date)}
                </p>
              </div>
            </div>

            {/* Customer Details */}
            <div style={{ fontSize: 'var(--text-xs)', color: '#334155' }}>
              <strong>Billed To:</strong> {selectedReceipt.customer?.full_name} ({selectedReceipt.customer?.email})<br />
              <strong>Service Location:</strong> {selectedReceipt.address?.street}, {selectedReceipt.address?.city}
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
              {selectedReceipt.charge_note && (
                <span><strong>Audit Note:</strong> {selectedReceipt.charge_note}</span>
              )}
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
  );
}
