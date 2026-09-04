import { Modal, Button } from '@/components/ui';
import type { Claim } from '@/types';

interface ClaimResolutionModalProps {
  selectedClaim: Claim | null;
  onClose: () => void;
  resolutionText: string;
  setResolutionText: (val: string) => void;
  refundAmount: string;
  setRefundAmount: (val: string) => void;
  onSubmit: () => void;
  isLoading: boolean;
}

export function ClaimResolutionModal({
  selectedClaim,
  onClose,
  resolutionText,
  setResolutionText,
  refundAmount,
  setRefundAmount,
  onSubmit,
  isLoading,
}: ClaimResolutionModalProps) {
  return (
    <Modal
      isOpen={Boolean(selectedClaim)}
      onClose={onClose}
      title={`🛡️ Resolve Claim #${selectedClaim?.id.slice(0, 8)}`}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-navy)', margin: 0 }}>
          Provide an Executive Resolution Response and optional instant refund under our 100% Make It Right Guarantee.
        </p>

        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
            Resolution Action Type
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '12px' }}>
            <button
              type="button"
              onClick={() => {
                setResolutionText('We have arranged a complimentary re-cleaning & hand-pressing of your garment at zero charge.');
                setRefundAmount('');
              }}
              style={{ padding: '8px 4px', fontSize: '11px', fontWeight: 'bold', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', cursor: 'pointer' }}
            >
              🔄 Free Re-Clean
            </button>
            <button
              type="button"
              onClick={() => {
                setResolutionText('We sincerely apologize for the inconvenience. A full refund has been credited to your payment method.');
                setRefundAmount('45.00');
              }}
              style={{ padding: '8px 4px', fontSize: '11px', fontWeight: 'bold', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', cursor: 'pointer' }}
            >
              💰 Monetary Refund
            </button>
            <button
              type="button"
              onClick={() => {
                setResolutionText('Thank you for bringing this to our attention. We have updated your garment profile notes.');
                setRefundAmount('');
              }}
              style={{ padding: '8px 4px', fontSize: '11px', fontWeight: 'bold', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f172a', cursor: 'pointer' }}
            >
              💬 Care Explanation
            </button>
          </div>

          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
            Executive Resolution Response (Visible to Customer)
          </label>
          <textarea
            value={resolutionText}
            onChange={(e) => setResolutionText(e.target.value)}
            placeholder="e.g. We deeply apologize. We have re-treated this garment and credited your account."
            rows={3}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-gray-300)',
              fontSize: 'var(--text-sm)',
            }}
          />
        </div>

        <div>
          <label style={{ fontSize: 'var(--text-xs)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
            Optional Refund Amount ($ USD)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={refundAmount}
            onChange={(e) => setRefundAmount(e.target.value)}
            placeholder="Optional e.g. 45.00 (leave blank for non-monetary resolution)"
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-gray-300)',
              fontSize: 'var(--text-sm)',
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={onSubmit}
            isLoading={isLoading}
          >
            Post Executive Resolution
          </Button>
        </div>
      </div>
    </Modal>
  );
}
