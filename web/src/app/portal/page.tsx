'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useCommercialAccount,
  useCommercialInvoices,
  useUpdateCommercialSchedule,
  usePayCommercialInvoice,
} from '@/hooks/useCommercial';
import { Button, Badge, Loader, Modal } from '@/components/ui';
import { useUIStore } from '@/stores/ui-store';
import type { CommercialInvoice, RecurringSchedule } from '@/lib/commercial/types';
import styles from './page.module.css';

export default function CommercialPortalPage() {
  const [selectedAccountId, setSelectedAccountId] = useState<string>('c1111111-1111-4111-a111-111111111111');
  const { data, isLoading } = useCommercialAccount(selectedAccountId);
  const { data: invoicesData } = useCommercialInvoices(selectedAccountId);
  const updateSchedule = useUpdateCommercialSchedule();
  const payInvoice = usePayCommercialInvoice();
  const addToast = useUIStore((s) => s.addToast);

  // Statement Modal State
  const [selectedInvoice, setSelectedInvoice] = useState<CommercialInvoice | null>(null);

  // Edit Schedule Modal State
  const [isEditScheduleOpen, setIsEditScheduleOpen] = useState(false);
  const [scheduleDays, setScheduleDays] = useState<string[]>(['Monday', 'Wednesday', 'Friday']);
  const [scheduleWindow, setScheduleWindow] = useState<'morning' | 'evening'>('morning');
  const [scheduleNotes, setScheduleNotes] = useState('');

  if (isLoading) {
    return <Loader fullScreen text="Loading commercial account portal..." />;
  }

  const accounts = data?.accounts || [];
  const activeAccount = data?.activeAccount;
  const stats = data?.stats;
  const invoices = invoicesData?.invoices || [];
  const rateCard = activeAccount?.rate_card;
  const schedule = activeAccount?.recurring_schedule;

  const handleOpenScheduleModal = () => {
    if (schedule) {
      setScheduleDays(schedule.days);
      setScheduleWindow(schedule.pickup_window);
      setScheduleNotes(schedule.delivery_notes || '');
    }
    setIsEditScheduleOpen(true);
  };

  const handleSaveSchedule = async () => {
    if (!activeAccount) return;

    const newSchedule: RecurringSchedule = {
      days: scheduleDays,
      pickup_window: scheduleWindow,
      service_type: schedule?.service_type || 'mixed',
      delivery_notes: scheduleNotes,
    };

    try {
      await updateSchedule.mutateAsync({
        account_id: activeAccount.id,
        schedule: newSchedule,
      });

      addToast({
        type: 'success',
        title: 'Schedule Updated',
        message: 'Recurring commercial collection route updated successfully.',
      });
      setIsEditScheduleOpen(false);
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: (err as Error).message,
      });
    }
  };

  const handlePayInvoice = async (invoiceId: string) => {
    try {
      await payInvoice.mutateAsync({ invoice_id: invoiceId });
      addToast({
        type: 'success',
        title: 'Invoice Settled',
        message: 'Commercial invoice marked as paid under Net Terms.',
      });
      if (selectedInvoice && selectedInvoice.id === invoiceId) {
        setSelectedInvoice({ ...selectedInvoice, status: 'paid' });
      }
    } catch (err: unknown) {
      addToast({
        type: 'error',
        title: 'Settlement Failed',
        message: (err as Error).message,
      });
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Executive Account Hero */}
        <div className={styles.heroCard}>
          <div className={styles.heroHeader}>
            <div className={styles.heroBrand}>
              <span className={styles.accountBadge}>🏢 B2B Commercial Enterprise Portal</span>
              <h1 className={styles.companyTitle}>{activeAccount?.business_name}</h1>
              <p className={styles.accountMeta}>
                Contact: {activeAccount?.contact_name} • {activeAccount?.contact_phone} • Terms:{' '}
                {activeAccount?.payment_terms.replace('_', ' ').toUpperCase()}
              </p>
            </div>

            {/* Account Switcher for Demo / Multi-Location Testing */}
            <div className={styles.accountSelectorBox}>
              <label htmlFor="accountSelect" className={styles.selectLabel}>
                Switch Account:
              </label>
              <select
                id="accountSelect"
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className={styles.selectInput}
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.business_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gold)' }}>
              🚚 Route Assignment: <strong>DFW Commercial Route #2 (Marcus Sterling)</strong>
            </span>
            <Link href="/commercial">
              <Button variant="outlineLight" size="sm">
                + Register New Corporate Facility
              </Button>
            </Link>
          </div>
        </div>

        {/* Executive KPI Grid */}
        <div className={styles.kpiGrid}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Monthly Volume</span>
            <h2 className={styles.kpiValue}>{stats?.total_monthly_lbs.toLocaleString()} lbs</h2>
            <span className={styles.kpiSub}>Linen, Towel & Guest Valet</span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Active Hampers</span>
            <h2 className={styles.kpiValue}>{stats?.active_hampers} Carts</h2>
            <span className={styles.kpiSub}>RFID Geo-Tracked</span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>On-Time SLA Rate</span>
            <h2 className={styles.kpiValue}>{stats?.on_time_sla_rate}</h2>
            <span className={styles.kpiSub}>{activeAccount?.sla_guarantee}</span>
          </div>

          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>30-Day Billing Total</span>
            <h2 className={styles.kpiValue}>${stats?.current_cycle_spend.toFixed(2)}</h2>
            <span className={styles.kpiSub}>Net-30 Consolidated</span>
          </div>
        </div>

        {/* Two-Column Details */}
        <div className={styles.twoColGrid}>
          {/* Contract Rate Card */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <span>📋</span> Negotiated Contract Rate Card
              </h2>
              <Badge variant="success">VIP Volume Tier</Badge>
            </div>

            <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-600)', margin: 0 }}>
              Custom enterprise pricing locked under Master Service Agreement with Lydia Painting, LLC.
            </p>

            <div className={styles.rateCardGrid}>
              <div className={styles.rateItem}>
                <span className={styles.rateLabel}>Towel & Linen Service</span>
                <span className={styles.ratePrice}>${rateCard?.towel_service_per_lb.toFixed(2)} / lb</span>
              </div>
              <div className={styles.rateItem}>
                <span className={styles.rateLabel}>Wash & Fold Bulk</span>
                <span className={styles.ratePrice}>${rateCard?.wash_fold_per_lb.toFixed(2)} / lb</span>
              </div>
              <div className={styles.rateItem}>
                <span className={styles.rateLabel}>Guest Valet 2-Pc Suit</span>
                <span className={styles.ratePrice}>${rateCard?.suit_price.toFixed(2)} / ea</span>
              </div>
              <div className={styles.rateItem}>
                <span className={styles.rateLabel}>Executive Dress Shirts</span>
                <span className={styles.ratePrice}>${rateCard?.shirt_price.toFixed(2)} / ea</span>
              </div>
            </div>

            <div style={{ background: '#f8fafc', padding: '10px 14px', borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-xs)', color: 'var(--color-navy)' }}>
              <strong>SLA Turnaround Commitment:</strong> {rateCard?.turnaround_hours}-hour turnaround guaranteed with {rateCard?.minimum_lbs_per_pickup}-lb minimum floor.
            </div>
          </div>

          {/* Recurring Route Schedule */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <span>🗓️</span> Automated Route Pickup Schedule
              </h2>
              <Button variant="outline" size="sm" onClick={handleOpenScheduleModal}>
                Edit Route Days
              </Button>
            </div>

            <div>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-500)', display: 'block', marginBottom: '8px' }}>
                Scheduled Collection Days:
              </span>
              <div className={styles.scheduleDaysList}>
                {schedule?.days.map((d) => (
                  <span key={d} className={styles.dayBadge}>
                    ✓ {d}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-700)' }}>
              <strong>Pickup Window:</strong> {schedule?.pickup_window === 'morning' ? '🌅 Morning Shift (7:30–10:00 AM)' : '🌆 Evening Shift (5:00–8:00 PM)'}
            </div>

            {schedule?.delivery_notes && (
              <div className={styles.deliveryNoteAlert}>
                <strong>Facility Access & Loading Bay:</strong> {schedule.delivery_notes}
              </div>
            )}
          </div>
        </div>

        {/* Consolidated Monthly Invoices Table */}
        <div className={styles.invoicesTableCard}>
          <div className={styles.sectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>
                <span>🧾</span> Consolidated Monthly Statements & Invoices
              </h2>
              <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-gray-500)', margin: '2px 0 0' }}>
                Itemized corporate billing records for account reconciliation.
              </p>
            </div>
          </div>

          <div className={styles.tableWrapper}>
            <table className={styles.invoicesTable}>
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Billing Period</th>
                  <th>Total Weight</th>
                  <th>Items</th>
                  <th>Total Due</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '30px' }}>
                      No invoices issued yet for this billing cycle.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className={styles.invNumber}>{inv.invoice_number}</td>
                      <td>{inv.billing_period}</td>
                      <td>{inv.total_weight_lbs} lbs</td>
                      <td>{inv.total_items} items</td>
                      <td className={styles.invAmount}>${inv.total.toFixed(2)}</td>
                      <td>
                        <Badge variant={inv.status === 'paid' ? 'delivered' : 'warning'}>
                          {inv.status.toUpperCase()}
                        </Badge>
                      </td>
                      <td>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedInvoice(inv)}
                        >
                          View Statement
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Statement Detail Modal (Printable PDF Format) */}
        <Modal
          isOpen={Boolean(selectedInvoice)}
          onClose={() => setSelectedInvoice(null)}
          title={`🧾 Invoice ${selectedInvoice?.invoice_number}`}
          size="lg"
        >
          {selectedInvoice && (
            <div className={styles.statementModal}>
              <div className={styles.statementHead}>
                <div className={styles.statementBrand}>
                  <h3>⚽ FIRST ELEVEN CLEANERS</h3>
                  <p style={{ margin: '2px 0 0', color: 'var(--color-gray-600)' }}>
                    Lydia Painting, LLC (d/b/a First Eleven Cleaners)<br />
                    1530 Main St, Dallas, TX 75201 • SDVOSB / Veteran-HUB Certified
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <strong>{selectedInvoice.invoice_number}</strong>
                  <p style={{ margin: '2px 0 0', color: 'var(--color-gray-500)' }}>
                    Issue Date: {selectedInvoice.issue_date}<br />
                    Due Date: {selectedInvoice.due_date}
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--color-cream)', padding: '12px', borderRadius: '8px' }}>
                <div>
                  <strong>Billed To:</strong>
                  <p style={{ margin: '2px 0 0' }}>
                    {selectedInvoice.business_name}<br />
                    Attn: Julian Montgomery<br />
                    Dallas, TX
                  </p>
                </div>
                <div>
                  <strong>Billing Cycle:</strong>
                  <p style={{ margin: '2px 0 0' }}>{selectedInvoice.billing_period}</p>
                </div>
              </div>

              {/* Itemized Lines */}
              <table className={styles.statementItemsTable}>
                <thead>
                  <tr>
                    <th>Service Description</th>
                    <th>Qty / Units</th>
                    <th>Rate</th>
                    <th>Line Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedInvoice.items.map((item, idx) => (
                    <tr key={idx}>
                      <td>{item.description}</td>
                      <td>{item.quantity} {item.unit}</td>
                      <td>${item.unit_price.toFixed(2)}</td>
                      <td><strong>${item.total.toFixed(2)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className={styles.statementTotals}>
                <div>Subtotal: <strong>${selectedInvoice.subtotal.toFixed(2)}</strong></div>
                <div>Texas Sales Tax (8.25%): <strong>${selectedInvoice.tax.toFixed(2)}</strong></div>
                <div className={styles.totalRow}>Total Amount Due: <strong>${selectedInvoice.total.toFixed(2)}</strong></div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-gray-200)', paddingTop: '12px' }}>
                <div>
                  {selectedInvoice.status !== 'paid' ? (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handlePayInvoice(selectedInvoice.id)}
                      isLoading={payInvoice.isPending}
                    >
                      💳 Settle Invoice (Net Terms)
                    </Button>
                  ) : (
                    <Badge variant="delivered">PAID IN FULL</Badge>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <Button variant="outline" size="sm" onClick={() => window.print()}>
                    🖨️ Print Statement
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedInvoice(null)}>
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Modal>

        {/* Edit Route Schedule Modal */}
        <Modal
          isOpen={isEditScheduleOpen}
          onClose={() => setIsEditScheduleOpen(false)}
          title="🗓️ Update Recurring Route Days"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', fontSize: 'var(--text-xs)' }}>
            <p style={{ color: 'var(--color-navy)', margin: 0 }}>
              Adjust scheduled collection days for <strong>{activeAccount?.business_name}</strong>.
            </p>

            <div>
              <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>
                Pickup Days:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day) => {
                  const isChecked = scheduleDays.includes(day);
                  return (
                    <label key={day} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setScheduleDays([...scheduleDays, day]);
                          } else {
                            setScheduleDays(scheduleDays.filter((d) => d !== day));
                          }
                        }}
                      />
                      <span>{day}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                Preferred Shift Window:
              </label>
              <select
                value={scheduleWindow}
                onChange={(e) => setScheduleWindow(e.target.value as 'morning' | 'evening')}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              >
                <option value="morning">🌅 Morning Shift (7:30–10:00 AM)</option>
                <option value="evening">🌆 Evening Shift (5:00–8:00 PM)</option>
              </select>
            </div>

            <div>
              <label style={{ fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                Dock / Concierge Delivery Notes:
              </label>
              <textarea
                value={scheduleNotes}
                onChange={(e) => setScheduleNotes(e.target.value)}
                rows={2}
                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button variant="ghost" onClick={() => setIsEditScheduleOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveSchedule}
                isLoading={updateSchedule.isPending}
              >
                Save Schedule
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>
  );
}
