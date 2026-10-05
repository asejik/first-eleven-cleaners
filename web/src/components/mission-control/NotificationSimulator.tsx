import { Badge, Button } from '@/components/ui';
import type { NotificationItem } from '@/hooks/useNotifications';
import styles from '@/app/mission-control/page.module.css';

interface NotificationSimulatorProps {
  notifications: NotificationItem[];
  testEmailRecipient: string;
  setTestEmailRecipient: (val: string) => void;
  isSendingTestEmail: boolean;
  onSendTestEmail: () => void;
}

export function NotificationSimulator({
  notifications,
  testEmailRecipient,
  setTestEmailRecipient,
  isSendingTestEmail,
  onSendTestEmail,
}: NotificationSimulatorProps) {
  return (
    <div className={styles.sectionBlock}>
      <div className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>
          <span>📱</span> Message Log
        </h3>
        <Badge variant="info">Plug & Play Ready</Badge>
      </div>

      <p style={{ fontSize: 'var(--text-xs)', color: '#94a3b8', margin: 0 }}>
        The latest SMS and WhatsApp messages sent to and received from customers. Status messages are sent automatically when an order moves stage.
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
