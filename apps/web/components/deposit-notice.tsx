'use client';

import { AlertTriangle } from 'lucide-react';

/**
 * Warning popup shown right after a successful registration. It nudges the new
 * user toward the top-up screen before they can reach the query screens.
 */
export function DepositNoticeModal({
  open,
  onContinue,
  onClose,
  minDeposit = 100,
}: {
  open: boolean;
  onContinue: () => void;
  onClose: () => void;
  minDeposit?: number;
}) {
  if (!open) return null;

  return (
    <div className="popup" style={{ paddingTop: 120 }} data-testid="deposit-popup">
      <div className="popup__wrap max900">
        <button type="button" className="popup__close" onClick={onClose} aria-label="Close" />
        <div className="popup__title">
          attention! <hr /> Deposit required
        </div>
        <div className="popup__block popup__block-center">
          <p style={{ fontSize: 18, lineHeight: 1.6 }}>
            Query screens — CVV, SSN, Checkers, Dumps, Proxies, Banks &amp; Accounts, RDP, SMS Activate,
            Flooders and OTP BOT — stay locked until you top up your balance with at least{' '}
            <strong>${minDeposit}</strong>.
          </p>
        </div>
        <div className="popup__block flex jcc">
          <button type="button" className="sitebutton maxwidth300 orange" onClick={onContinue}>
            Top up balance
          </button>
        </div>
      </div>
    </div>
  );
}

/** Inline warning strip shown on the top-up screen when access is locked. */
export function DepositLockBanner({ minDeposit = 100 }: { minDeposit?: number }) {
  return (
    <div
      className="mb-4 flex items-start gap-3 rounded-xl border border-[#ed5d15] bg-[#ed5d15]/10 px-4 py-3 text-sm text-[#8a3a0e] dark:text-[#f3b48a]"
      data-testid="deposit-banner"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#ed5d15]" />
      <span>
        Query screens are locked. Top up at least <strong>${minDeposit}</strong> across your deposits to
        unlock them automatically — <strong>coupons and the current balance do not count</strong>.
      </span>
    </div>
  );
}
