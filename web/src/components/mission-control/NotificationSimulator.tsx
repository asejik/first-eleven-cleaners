import { Badge, Button } from '@/components/ui';
import { ORDER_STATUS_MAP, type OrderStatusKey } from '@/lib/constants';
import type { Order } from '@/types';
import type { NotificationItem } from '@/hooks/useNotifications';
import styles from '@/app/mission-control/page.module.css';

interface NotificationSimulatorProps {
  stages: OrderStatusKey[];
  orders: Order[];
  notifications: NotificationItem[];
  testStage: OrderStatusKey;
  setTestStage: (val: OrderStatusKey) => void;
  testEmailRecipient: string;
  setTestEmailRecipient: (val: string) => void;
  isSendingTestEmail: boolean;
  onSendTestEmail: () => void;
  onManualTestNotification: (orderId: string) => void;
  isDispatchingNotif: boolean;
}

export function NotificationSimulator({
  stages,
  orders,
  notifications,
  testStage,
  setTestStage,
  testEmailRecipient,
  setTestEmailRecipient,
  isSendingTestEmail,
  onSendTestEmail,
  onManualTestNotification,
  isDispatchingNotif,
}: NotificationSimulatorProps) {
  return (
    <div className={styles.sectionBlock}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>
          <span>📱</span> Real-Time SMS & WhatsApp Simulator HUD
        </h3>
        <Badge variant="info">Plug & Play Ready</Badge>
      </div>

      <p style={{ fontSize: 'var(--text-xs)', color: '#94a3b8', margin: 0 }}>
        Audit log of outgoing status messages dispatched to customers via Simulated Provider or Live Twilio.
      </p>

      {/* Live Resend Email Tester */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#131d35', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--color-gold)', fontWeight: 'bold' }}>
            📧 Test Live Resend Email Dispatch (RESEND_API_KEY):
          </span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="email"
            placeholder="Enter your test email (e.g. you@example.com)"
            value={testEmailRecipient}
            onChange={(e) => setTestEmailRecipient(e.target.value)}
            style={{ flex: 1, padding: '6px 10px', fontSize: 'var(--text-xs)', background: '#1e293b', color: '#ffffff', border: '1px solid #475569', borderRadius: '4px' }}
          />
          <Button
            variant="primary"
            size="sm"
            onClick={onSendTestEmail}
            isLoading={isSendingTestEmail}
          >
            ✉️ Send Test Email
          </Button>
        </div>
      </div>

      {/* Quick Dispatch Test Trigger */}
      {orders.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: '#131d35', padding: '8px 12px', borderRadius: 'var(--radius-md)' }}>
          <span style={{ fontSize: 'var(--text-2xs)', color: '#cbd5e1' }}>Test SMS/WhatsApp:</span>
          <select
            value={testStage}
            onChange={(e) => setTestStage(e.target.value as OrderStatusKey)}
            style={{ background: '#1e293b', color: '#ffffff', border: '1px solid #475569', borderRadius: '4px', fontSize: 'var(--text-xs)', padding: '4px' }}
          >
            {stages.map((st) => (
              <option key={st} value={st}>
                {ORDER_STATUS_MAP[st]?.label}
              </option>
            ))}
          </select>
          <Button
            variant="outlineLight"
            size="sm"
            onClick={() => onManualTestNotification(orders[0].id)}
            disabled={isDispatchingNotif}
          >
            Send to Order #{orders[0].order_number || orders[0].id.slice(0, 8)}
          </Button>
        </div>
      )}

      <div className={styles.messagesFeed}>
        {notifications.length === 0 ? (
          <p style={{ fontSize: 'var(--text-2xs)', color: '#64748b', textAlign: 'center', padding: '20px 0' }}>
            No messages dispatched yet. Advance an order stage or run intake to trigger alerts.
          </p>
        ) : (
          notifications.map((msg) => {
            const isEscalation = msg.text.includes('[AI CONCIERGE ESCALATION]');
            return (
              <div
                key={msg.id}
                className={styles.msgBubble}
                style={isEscalation ? { border: '1px solid #ef4444', background: 'rgba(239, 68, 68, 0.1)' } : undefined}
              >
                <div className={styles.msgMeta}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>
                      {msg.channel === 'whatsapp' ? '🟢 WhatsApp' : '💬 SMS'} ➔ {msg.customer_name} ({msg.customer_phone})
                    </span>
                    {isEscalation && <Badge variant="error">🚨 AI Escalation</Badge>}
                  </div>
                  <span style={{ whiteSpace: 'nowrap' }}>
                    {new Date(msg.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} • {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className={styles.msgText}>{msg.text}</p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
