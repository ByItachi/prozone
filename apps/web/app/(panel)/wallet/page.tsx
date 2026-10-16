'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Wallet } from '@/lib/types';
import { DepositLockBanner } from '@/components/deposit-notice';

type BillingDetails = {
  address: string | null;
  ltc_address: string | null;
  usdt_address: string | null;
  rate: number;
  ltc_rate: number;
  usdt_rate: number;
  commission: number;
  ltc_commission: number;
  usdt_commission: number;
  requiredConfirmations: number;
};

type Method = 'BTC' | 'LTC' | 'USDT' | 'COUPON';

function BitcoinIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <path
        d="M 64 1 C 29.26 1 1 29.26 1 64 C 1 98.74 29.26 127 64 127 C 98.74 127 127 98.74 127 64 C 127 29.26 98.74 1 64 1 z M 64 7 C 95.43 7 121 32.57 121 64 C 121 95.43 95.43 121 64 121 C 32.57 121 7 95.43 7 64 C 7 32.57 32.57 7 64 7 z M 53 31 C 51.34 31 50 32.34 50 34 L 50 41 L 47 41 C 45.34 41 44 42.34 44 44 C 44 45.66 45.34 47 47 47 L 50 47 L 50 81 L 47 81 C 45.34 81 44 82.34 44 84 C 44 85.66 45.34 87 47 87 L 50 87 L 50 94 C 50 95.66 51.34 97 53 97 C 54.66 97 56 95.66 56 94 L 56 87 L 64 87 L 64 94 C 64 95.66 65.34 97 67 97 C 68.66 97 70 95.66 70 94 L 70 87 L 75 87 C 82.17 87 88 81.17 88 74 C 88 68.37 84.400625 63.589297 79.390625 61.779297 C 81.020625 59.609297 82 56.92 82 54 C 82 47.17 76.7 41.560781 70 41.050781 L 70 34 C 70 32.34 68.66 31 67 31 C 65.34 31 64 32.34 64 34 L 64 41 L 56 41 L 56 34 C 56 32.34 54.66 31 53 31 z M 56 47 L 69 47 C 72.86 47 76 50.14 76 54 C 76 57.86 72.86 61 69 61 L 56 61 L 56 47 z M 56 67 L 69 67 L 75 67 C 78.86 67 82 70.14 82 74 C 82 77.86 78.86 81 75 81 L 56 81 L 56 67 z"
      />
    </svg>
  );
}

function LitecoinIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
      <path d="m56.3 102.8 8.3-31.3 19.7-7.2 4.9-18.4-.2-.4-19.4 7.1L83.6 0H44L25.7 68.6l-15.2 5.6-5.1 18.9 15.3-5.5L9.9 128h105.4l6.7-25.2z" />
    </svg>
  );
}

function UsdtIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2000 2000">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1000 2000c552.26 0 1000-447.74 1000-1000S1552.26 0 1000 0 0 447.74 0 1000s447.74 1000 1000 1000z"
        fill="#26A17B"
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M1123.42 866.76V718.42h340.18V491.34H541.84v227.08H882v148.3c-276.24 12.66-483.98 67.28-483.98 132.64 0 65.36 207.74 119.98 483.98 132.68v474.76h241.42v-474.82c275.78-12.66 483.06-67.26 483.06-132.62 0-65.36-207.28-119.96-483.06-132.62v.02zm0 239.28v-.1c-6.92.44-42.5 2.56-121.76 2.56-63.3 0-107.84-1.8-123.52-2.58v.12c-243.68-10.74-425.72-53.14-425.72-103.82 0-50.64 182.04-93.02 425.72-103.84v165.5c15.9 1.1 61.56 3.8 124.58 3.8 75.72 0 113.76-3.14 120.7-3.8v-165.4c243.12 10.8 424.72 53.2 424.72 103.74 0 50.62-181.6 92.98-424.72 103.8v.02z"
        fill="#fff"
      />
    </svg>
  );
}

function CouponIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
      <path d="M4 4.85v.9h1v-.9H4Zm7 0v.9h1v-.9h-1Zm-7 1.8v.9h1v-.9H4Zm7 0v.9h1v-.9h-1Zm-7 1.8v.9h1v-.9H4Zm7 0v.9h1v-.9h-1Zm-7 1.8v.9h1v-.9H4Zm7 0v.9h1v-.9h-1Z" />
      <path d="M1.5 3A1.5 1.5 0 0 0 0 4.5V6a.5.5 0 0 0 .5.5 1.5 1.5 0 1 1 0 3 .5.5 0 0 0-.5.5v1.5A1.5 1.5 0 0 0 1.5 13h13a1.5 1.5 0 0 0 1.5-1.5V10a.5.5 0 0 0-.5-.5 1.5 1.5 0 0 1 0-3A.5.5 0 0 0 16 6V4.5A1.5 1.5 0 0 0 14.5 3h-13ZM1 4.5a.5.5 0 0 1 .5-.5h13a.5.5 0 0 1 .5.5v1.05a2.5 2.5 0 0 0 0 4.9v1.05a.5.5 0 0 1-.5.5h-13a.5.5 0 0 1-.5-.5v-1.05a2.5 2.5 0 0 0 0-4.9V4.5Z" />
    </svg>
  );
}

const METHODS: { id: Method; label: string; icon: () => React.ReactNode }[] = [
  { id: 'BTC', label: 'Bitcoin', icon: BitcoinIcon },
  { id: 'LTC', label: 'Litecoin', icon: LitecoinIcon },
  { id: 'USDT', label: 'USDT (TRC20)', icon: UsdtIcon },
  { id: 'COUPON', label: 'Coupon', icon: CouponIcon },
];

export default function WalletPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [method, setMethod] = useState<Method>('BTC');
  const [couponCode, setCouponCode] = useState('');
  void user;

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: () => api<Wallet>('/api/wallet'),
  });

  const { data: billing } = useQuery({
    queryKey: ['wallet', 'billing'],
    queryFn: () => api<BillingDetails>('/api/wallet/billing'),
  });

  const availCoupon = useMutation({
    mutationFn: (code: string) =>
      api(`/api/wallet/coupon/avail`, {
        method: 'POST',
        body: JSON.stringify({ code }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wallet'] }),
  });

  const activeAddress =
    method === 'BTC' ? billing?.address : method === 'LTC' ? billing?.ltc_address : billing?.usdt_address;
  const rate = method === 'BTC' ? billing?.rate : method === 'LTC' ? billing?.ltc_rate : billing?.usdt_rate;
  const commission =
    method === 'BTC' ? billing?.commission : method === 'LTC' ? billing?.ltc_commission : billing?.usdt_commission;

  const copyAddress = async () => {
    if (!activeAddress) return;
    try {
      await navigator.clipboard.writeText(activeAddress);
    } catch {
      // ignore
    }
  };
  return (
    <div className="content__block">
      {wallet && wallet.unlocked === false && <DepositLockBanner minDeposit={wallet.minDeposit} />}
      <div className="row balance" style={{ gap: '25px 0' }}>
        {METHODS.map((m) => (
          <div className="col-md-3 col-xs-6" key={m.id}>
            <label>
              <input
                type="radio"
                name="balance1"
                checked={method === m.id}
                onChange={() => setMethod(m.id)}
              />
              <span>
                <m.icon />
                {m.label}
              </span>
            </label>
          </div>
        ))}
      </div>

      <div className="balance__body flex jcc aic">
        <div className="balance__body-wrap">
          <div className="row">
            <div className="col-md-8 col-sm-7 col-xs-12">
              <div className="balance__body-form">
                {method !== 'COUPON' ? (
                  <>
                    <div className="balance__body-form-copy">
                      <div className="formgroup">
                        <span>
                          <strong>
                            Please send <em>{method}</em> to this wallet:
                          </strong>
                        </span>
                      </div>
                      <div className="copytext left">
                        {activeAddress && (
                          <span onClick={copyAddress} style={{ cursor: 'pointer' }} title="Click to copy">
                            {activeAddress}
                          </span>
                        )}
                      </div>
                      <div className="header__total" style={{ marginTop: 20, color: '#aa0000' }}>
                        Do Not Change Address When There&apos;s Any Unconfirmed Transactions
                      </div>
                    </div>
                    <div className="balance__body-form-total">
                      <div className="header__total">
                        Daily {method} exchange rate: ${rate?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
                      </div>
                      <br />
                      <div className="header__total">
                        Required Confirmations : <strong>{billing?.requiredConfirmations ?? 1}</strong>
                      </div>
                      {commission != null && commission > 0 && (
                        <div className="header__total">
                          Fees Commission : <strong>{commission}%</strong>{' '}
                          <small style={{ color: '#ccc' }}>(commission included on course)</small>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="balance__body-form-copy">
                      <div className="formgroup">
                        <span>
                          <strong>
                            Please write your <em>Coupon Code</em> below:
                          </strong>
                        </span>
                      </div>
                      <div className="copytext left">
                        <input
                          type="text"
                          placeholder="coupon code"
                          value={couponCode}
                          onChange={(e) => setCouponCode(e.target.value)}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
            <div className="col-md-4 col-sm-5 col-xs-12">
              {method === 'COUPON' && (
                <div className="balance__body-qr" style={{ marginTop: 60 }}>
                  <button
                    type="button"
                    className="sitebutton orange height35"
                    style={{ marginTop: 20 }}
                    disabled={availCoupon.isPending}
                    onClick={() => availCoupon.mutate(couponCode)}
                  >
                    Avail Coupon
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
