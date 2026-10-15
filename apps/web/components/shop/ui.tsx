'use client';

import { Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ChevronUp, Clock, RotateCw } from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export type ShopField = {
  name: string;
  label?: string;
  type: 'text' | 'select' | 'textarea' | 'range' | 'fromto' | 'bank';
  placeholder?: string;
  options?: string[];
  accent?: boolean;
  info?: string;
  required?: boolean;
  rangeLabel?: string;
};

export type ClearConfig = {
  refresh?: boolean;
  leftInfo?: string;
  extra?: { label: string; tooltip?: string[] }[];
  clearLabel?: string;
};

export type ShopConfig = {
  title: string;
  priceBadge?: string;
  sourceCategories?: string[];
  tabs?: string[];
  subTabs?: string[];
  fields: ShopField[];
  itemFields?: { key: string; label: string; type?: 'text' | 'number' }[];
  preorder?: boolean;
  searchClear?: {
    refresh?: boolean;
    leftInfo?: string;
    extra?: { label: string; tooltip?: string[] }[];
    clearLabel?: string;
  };
  hideFilter?: boolean;
  gridCols?: number;
  pills?: string[];
  subFields?: ShopField[];
  subTable?: { columns: string[]; selectAll?: boolean };
  subClear?: ClearConfig;
  leftAction?: string;
  rightAction?: string;
  table?: { columns: string[]; selectAll?: boolean };
  altTable?: { columns: string[]; selectAll?: boolean };
  emptyMessage?: string;
};

const btn = {
  search: { background: '#3f9e0f', color: '#fff' },
  clear: { background: '#e5231b', color: '#fff' },
  orange: { background: '#ed5d15', color: '#fff' },
};

export function ShopPage(props: { config: ShopConfig; category: string }) {
  return (
    <Suspense fallback={null}>
      <ShopPageInner {...props} />
    </Suspense>
  );
}

function ShopPageInner({ config, category }: { config: ShopConfig; category: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const maxSub = Math.max((config.subTabs?.length ?? 1) - 1, 0);
  const rawType = Number(params.get('type') ?? '0');
  const subTab = Number.isFinite(rawType) ? Math.min(Math.max(rawType, 0), maxSub) : 0;
  const setSubTab = (i: number) =>
    router.replace(i === 0 ? pathname : `${pathname}?type=${i}`, { scroll: false });
  const [tab, setTabState] = useState(0);
  const setTab = (i: number) => {
    setTabState(i);
  };
  const [filterOpen, setFilterOpen] = useState(true);
  const [searched, setSearched] = useState(false);
  const [preorderView, setPreorderView] = useState(false);
  const [page, setPage] = useState(1);
  const PER_PAGE = 50;
  const activeTable = subTab > 0 && config.subTable ? config.subTable : config.table;
  const activeClear = subTab > 0 && config.subClear ? config.subClear : config.searchClear;

  const clearInputs = () => {
    setSearched(false);
    document
      .querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('.shop input, .shop select, .shop textarea')
      .forEach((el) => {
        if (el instanceof HTMLSelectElement) el.selectedIndex = 0;
        else if (el instanceof HTMLInputElement && el.type === 'checkbox') el.checked = false;
        else el.value = '';
      });
  };

  const cats = config.sourceCategories && config.sourceCategories.length > 0 ? config.sourceCategories : [category];

  const products = useQuery({
    queryKey: ['products', cats.join(',')],
    queryFn: async () => {
      const merged: ShopProduct[] = [];
      const seen = new Set<string>();
      for (const c of cats) {
        const res = await api<{ items: ShopProduct[] }>(`/api/products?category=${encodeURIComponent(c)}&limit=50`);
        for (const p of res.items ?? []) {
          if (!seen.has(p.id)) {
            seen.add(p.id);
            merged.push(p);
          }
        }
      }
      return merged;
    },
    refetchInterval: 5000,
  });

  const totalRows = products.data?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / PER_PAGE));
  const pageRows = (products.data ?? []).slice((page - 1) * PER_PAGE, page * PER_PAGE);

  if (preorderView && config.preorder) {
    return (
      <div className="shop">
        <PreorderView onBack={() => setPreorderView(false)} backLabel={config.title} />
      </div>
    );
  }

  return (
    <div className="shop">
      <div className="shop__head">
        <h1 className="shop__title">{config.title}</h1>
        {config.priceBadge && <span className="shop__price">{config.priceBadge}</span>}
      {config.tabs && (
        <div className="shop__tabs-wrap">
          <div className="shop__tabs">
            {config.tabs.map((t, i) => (
              <button
                key={t}
                type="button"
                className={cn(i === tab && 'active', i === tab && subTab > 0 && i === 0 && 'has-sub')}
                onClick={() => {
                  if (config.subTabs && tab === i && subTab === 0) {
                    setSubTab(1);
                  } else {
                    setTab(i);
                    if (subTab > 0) router.replace(pathname, { scroll: false });
                  }
                }}
              >
                {t}
              </button>
            ))}
          </div>
          {config.subTabs && subTab > 0 && (
            <div
              className="shop__tabs shop__tabs--sub"
              style={{ width: `${100 / config.tabs.length}%`, marginLeft: `${(100 / config.tabs.length) * tab}%` }}
            >
              {config.subTabs.map((t, i) => (
                <button key={t} type="button" className={i + 1 === subTab ? 'active' : ''} onClick={() => setSubTab(i + 1)}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
      </div>

      {filterOpen && (
        <div className="shop__filters" style={config.gridCols ? { gridTemplateColumns: `repeat(${config.gridCols}, 1fr)` } : undefined}>
          {(subTab > 0 && config.subFields ? config.subFields : config.fields).map((f) => (
            <ShopFieldControl key={f.name} field={f} />
          ))}
          {activeClear && (activeClear.leftInfo || activeClear.extra) ? (
            <div className="filterbutton filterbutton__new">
              {activeClear.leftInfo && (
                <div className="filterbutton__infolink">
                  <a href="#" className="infolink" onClick={(e) => e.preventDefault()}>
                    <InfoDot /> {activeClear.leftInfo}
                  </a>
                </div>
              )}
              <div className="filterbutton">
                {activeClear.extra?.map((b) => (
                  <div key={b.label} className="filterbutton__wrapbut">
                    <button type="button" className="sitebutton maxwidth200 green" onClick={() => setSearched(true)}>
                      {b.label}
                    </button>
                    {b.tooltip && (
                      <div className="c-tooltip">
                        <span className="infolink" onClick={(e) => e.preventDefault()}>
                          <InfoDot /> Information
                        </span>
                        <small className="c-tooltiptext">
                          {b.tooltip.map((line) => (
                            <span key={line}>
                              <b>*</b> {line}
                              <br />
                            </span>
                          ))}
                        </small>
                      </div>
                    )}
                  </div>
                ))}
                <div className="filterbutton__wrapbut">
                  <button type="button" className="sitebutton min red" onClick={clearInputs}>
                    {activeClear.clearLabel ?? 'Clear'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            activeClear && (
              <div className="shop__actions">
                <div className="shop__actions-main">
                  {activeClear.refresh && (
                    <button type="button" className="shop__btn-refresh" aria-label="Refresh">
                      <RotateCw className="h-4 w-4" />
                    </button>
                  )}
                  <button type="button" className="shop__btn" style={btn.search} onClick={() => setSearched(true)}>
                    SEARCH
                  </button>
                  <button type="button" className="shop__btn shop__btn--clear" onClick={clearInputs}>
                    CLEAR
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      {config.hideFilter && (
        <div className="shop__hidefilter">
          <span />
          <label>
            Hide filter
            <input type="checkbox" checked={filterOpen} onChange={(e) => setFilterOpen(e.target.checked)} />
            <i className={cn(!filterOpen && 'closed')}>
              <ChevronUp className="h-3.5 w-3.5" />
            </i>
          </label>
          <span />
        </div>
      )}

      {(config.leftAction || config.rightAction) && (
        <div className="shop__row-actions">
          {config.leftAction ? (
            <button
              type="button"
              className="shop__btn shop__btn--lg"
              style={btn.orange}
              onClick={() => config.preorder && setPreorderView(true)}
            >
              <Clock className="h-5 w-5" /> {config.leftAction}
            </button>
          ) : (
            <span />
          )}
          {config.rightAction && (
            <button type="button" className="shop__btn shop__btn--lg" style={btn.orange}>
              {config.rightAction}
            </button>
          )}
        </div>
      )}

      {activeTable ? (
        <div className="shop__table-wrap">
          <table className="shop__table">
            <thead>
              <tr>
                {activeTable.columns.map((c) => (
                  <th key={c}>{c}</th>
                ))}
                {activeTable.selectAll && (
                  <th>
                    <label className="shop__selectall">
                      <input type="checkbox" /> Select all
                    </label>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((p) => (
                <tr key={p.id}>
                  {activeTable!.columns.map((c) => {
                    const key = columnKey(c);
                    const raw = key === 'price' ? `$${p.price.toFixed(2)}` : (p.metadata?.[key] ?? '—');
                    const tooltipTexts = ['info', 'binInfo', 'base'];
                    if (tooltipTexts.includes(key)) {
                      const label = key === 'binInfo' ? 'type' : key;
                      return (
                        <td key={c} className="small">
                          <span className="c-tooltip">
                            <span className="info">
                              <TooltipIcon />
                              {label}
                            </span>
                            {key === 'base' ? (
                              <small className="c-tooltiptext c-tooltiptext--wide" style={{ whiteSpace: 'nowrap' }}>
                                {raw}
                              </small>
                            ) : (
                              <small className="c-tooltiptext">{renderTooltipText(raw ?? '')}</small>
                            )}
                          </span>
                        </td>
                      );
                    }
                    if (key === 'address') {
                      return (
                        <td key={c}>
                          {raw === 'YES' || raw === 'Yes' || raw === 'yes' || raw === '1' ? (
                            <span className="shop__cell-check">✓</span>
                          ) : (
                            <span className="shop__cell-dash">—</span>
                          )}
                        </td>
                      );
                    }
                    if (key === 'refundable') {
                      const yes = raw === 'YES' || raw === 'Yes' || raw === 'yes' || raw === '1';
                      return (
                        <td key={c}>
                          <span className={`table__status ${yes ? 'open' : 'closed'}`}>
                            <i>{yes ? 'Yes' : 'No'}</i>
                            <span />
                          </span>
                        </td>
                      );
                    }
                    if (key === 'price') {
                      return (
                        <td key={c}>
                          <b>{raw}</b>
                        </td>
                      );
                    }
                    if (key === 'bin') {
                      return (
                        <td key={c}>
                          <strong>{raw}</strong>
                        </td>
                      );
                    }
                    return <td key={c}>{key === 'valid' ? <small>{raw}</small> : raw}</td>;
                  })}
                  {activeTable!.selectAll && (
                    <td>
                      <input type="checkbox" />
                      <button type="button" className="buyButton">
                        Buy
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {!products.isLoading && (products.data?.length ?? 0) === 0 && (
            <div className="shop__empty">{config.emptyMessage ?? 'No products available yet'}</div>
          )}
          <div className="content__block flex montserrat" style={{ justifyContent: 'flex-end' }}>
            <div className="pagination">
              <ul>
                <li className="pagination__prev">
                  <a href="#" role="button" style={page <= 1 ? { pointerEvents: 'none', opacity: 0.5 } : undefined} onClick={(e) => { e.preventDefault(); setPage((p) => Math.max(1, p - 1)); }}>
                    <svg width="9" height="14" viewBox="0 0 9 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M7.5625 1L1.5625 7L7.5625 13" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                </li>
                <li>
                  <span>current page ({page})</span>
                </li>
                <li className="pagination__next">
                  <a href="#" role="button" style={page >= totalPages ? { pointerEvents: 'none', opacity: 0.5 } : undefined} onClick={(e) => { e.preventDefault(); setPage((p) => Math.min(totalPages, p + 1)); }}>
                    <svg width="9" height="14" viewBox="0 0 9 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1.5625 1L7.5625 7L1.5625 13" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      ) : (
        <div className="shop__empty">{searched ? 'No results found' : (config.emptyMessage ?? 'Please Search For Results')}</div>
      )}
    </div>
  );
}

function columnKey(c: string): string {
  return c
    .replace(/[()]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join('')
    .replace('%', 'Valid')
    .replace(/^valid$/, 'valid');
}

function InfoDot() {
  return <span className="shop__infodot">i</span>;
}

function renderTooltipText(raw: string) {
  // Format: DOB:NO SSN:NO EMAIL:YES PHONE:NO  (info hücresi)
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.some((x) => /^(DOB|SSN|EMAIL|PHONE):/.test(x))) {
    return (
      <>
        {parts.map((p) => {
          const m = /^([A-Z]+):(.+)$/.exec(p);
          if (!m) return <span key={p}>{p} </span>;
          const val = m[2]!;
          const yes = /1|yes|true/i.test(val);
          return (
            <span key={p}>
              {m[1]!} : <span className={yes ? 'text-success' : 'text-danger'}>{val}</span> <br />
            </span>
          );
        })}
      </>
    );
  }
  // Diğer tooltip'ler (type / base): metni kelime satırlarına böl (referans VISA<br>DEBIT<br>CLASSIC<br>TD BANK, N.A.)
  return (
    <>
      {raw.split(/\s+/).filter(Boolean).map((w, i) => (
        <span key={i} style={{ display: 'block' }}>
          {w}
        </span>
      ))}
    </>
  );
}

function TooltipIcon() {
  return (
    <svg width="16" height="15" viewBox="0 0 16 15" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ verticalAlign: 'middle', marginRight: 4 }}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M7.69871 0C3.55671 0 0.199707 3.357 0.199707 7.499C0.199707 11.642 3.55671 14.999 7.69871 14.999C11.8417 14.999 15.1987 11.642 15.1987 7.499C15.1987 3.357 11.8417 0 7.69871 0ZM8.94871 12.305C8.94871 12.588 8.71971 12.817 8.43671 12.817H7.03171C6.74871 12.817 6.51871 12.588 6.51871 12.305V6.602C6.51871 6.319 6.74871 6.9 7.03171 6.9H8.43671C8.71971 6.9 8.94871 6.319 8.94871 6.602V12.305ZM7.69871 5.119C6.99671 5.119 6.42771 4.55 6.42771 3.847C6.42771 3.145 6.99671 2.576 7.69871 2.576C8.40171 2.576 8.97071 3.145 8.97071 3.847C8.97071 4.55 8.40171 5.119 7.69871 5.119Z"
        fill="#2E8D00"
      />
    </svg>
  );
}

export type ShopProduct = {
  id: string;
  name: string;
  slug: string;
  category: string;
  price: number;
  metadata: Record<string, string>;
  active: boolean;
};

type PreorderRow = {
  id: number;
  createTime: string;
  binShop: string;
  pricePiece: string;
  filters: string;
  statistics: string;
  fundsSpent: string;
  status: string;
};

const PREORDER_COLS = ['ID', 'Create Time', 'BIN/Shop', 'Price/Piece', 'Filters', 'Statistics', 'Funds Spent', 'Status', 'Actions'];

function PreorderView({ onBack, backLabel }: { onBack: () => void; backLabel: string }) {
  const [tab, setTab] = useState(0);
  const [filterOpen, setFilterOpen] = useState(true);
  const [bin, setBin] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [shop, setShop] = useState('Benumb');
  const [sellers, setSellers] = useState('Unavailable');
  const [states, setStates] = useState('');
  const [refundableOnly, setRefundableOnly] = useState(false);
  const [withAddressOnly, setWithAddressOnly] = useState(false);
  const [rows, setRows] = useState<PreorderRow[]>([]);

  const total = Number(qty) > 0 && Number(price) > 0 ? `$${(Number(qty) * Number(price)).toFixed(2)}` : 'Calculating...';

  const create = () => {
    if (bin.trim().length < 6 || !(Number(qty) > 0) || !(Number(price) > 0)) return;
    const filters = [refundableOnly ? 'Refundable' : null, withAddressOnly ? 'With Address' : null]
      .filter(Boolean)
      .join(', ');
    setRows((r) => [
      {
        id: r.length + 1,
        createTime: new Date().toISOString().slice(0, 16).replace('T', ' '),
        binShop: `${bin.trim()} / ${shop}`,
        pricePiece: `$${Number(price).toFixed(2)}`,
        filters: filters || '—',
        statistics: '0 / 0',
        fundsSpent: '$0.00',
        status: 'Pending',
      },
      ...r,
    ]);
    setBin('');
    setPrice('');
    setQty('1');
    setRefundableOnly(false);
    setWithAddressOnly(false);
  };

  return (
    <>
      <div className="shop__head">
        <h1 className="shop__title">BIN PREORDER</h1>
        <div className="shop__tabs-wrap shop__tabs-wrap--wide">
          <div className="shop__tabs shop__tabs--wide">
            <button type="button" className={tab === 0 ? 'active' : ''} onClick={() => setTab(0)}>
              Pre-Order
            </button>
            <button type="button" className={tab === 1 ? 'active' : ''} onClick={() => setTab(1)}>
              Notifications
            </button>
          </div>
        </div>
        <button type="button" className="shop__btn shop__btn--ghostback" onClick={onBack}>
          ‹ {backLabel}
        </button>
      </div>

      {tab === 1 ? (
        <div className="shop__empty">No notifications yet</div>
      ) : (
        <>
          {filterOpen && (
            <div className="shop__filters shop__filters--preorder">
              <div className="shop__field">
                <span className="shop__label">BIN</span>
                <input className="shop__control" type="text" placeholder="Enter BIN" value={bin} onChange={(e) => setBin(e.target.value)} />
              </div>
              <div className="shop__field">
                <span className="shop__label">Quantity</span>
                <input className="shop__control" type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
              </div>
              <div className="shop__field">
                <span className="shop__label">Bidding Price Per Piece</span>
                <input className="shop__control" type="text" placeholder="Enter Price" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="shop__field">
                <span className="shop__label">Total Amount</span>
                <input className="shop__control" type="text" readOnly value={total} />
              </div>
              <div className="shop__checks">
                <label className="shop__check">
                  <input type="checkbox" checked={refundableOnly} onChange={(e) => setRefundableOnly(e.target.checked)} />
                  Refundable Only
                </label>
                <label className="shop__check">
                  <input type="checkbox" checked={withAddressOnly} onChange={(e) => setWithAddressOnly(e.target.checked)} />
                  With Address Only
                </label>
              </div>
              <div className="shop__field">
                <span className="shop__label">Shop</span>
                <select className="shop__control" style={{ borderColor: '#ed5d15' }} value={shop} onChange={(e) => setShop(e.target.value)}>
                  {['Benumb', 'Prozone VIP', 'ExactBins'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="shop__field">
                <span className="shop__label">Sellers (Optional)</span>
                <select className="shop__control" style={{ borderColor: '#ed5d15' }} value={sellers} onChange={(e) => setSellers(e.target.value)}>
                  {['Unavailable'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div className="shop__field">
                <span className="shop__label">States (Optional)</span>
                <select className="shop__control" style={{ borderColor: '#ed5d15' }} value={states} onChange={(e) => setStates(e.target.value)}>
                  <option value="">Please select</option>
                  {['TX', 'CA', 'NY', 'FL', 'IL', 'PA', 'OH', 'GA', 'NC', 'MI'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <span />
              <span />
              <div className="shop__field shop__field--end">
                <button type="button" className="shop__btn shop__btn--green" onClick={create}>
                  CREATE PREORDER
                </button>
              </div>
            </div>
          )}

          <div className="shop__hidefilter">
            <span />
            <label>
              Hide filter <input type="checkbox" checked={filterOpen} onChange={(e) => setFilterOpen(e.target.checked)} />
              <i className={filterOpen ? '' : 'closed'}>⌃</i>
            </label>
            <span />
          </div>

          <div className="shop__table-wrap">
            <table className="shop__table">
              <thead>
                <tr>
                  {PREORDER_COLS.map((c) => (
                    <th key={c}>{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{r.id}</td>
                    <td>{r.createTime}</td>
                    <td>{r.binShop}</td>
                    <td>{r.pricePiece}</td>
                    <td>{r.filters}</td>
                    <td>{r.statistics}</td>
                    <td>{r.fundsSpent}</td>
                    <td>{r.status}</td>
                    <td>
                      <button
                        type="button"
                        className="shop__btn shop__btn--ghostback !px-2 !py-1"
                        onClick={() => setRows((all) => all.filter((x) => x.id !== r.id))}
                      >
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="shop__table-foot">
              <span>Showing to of {rows.length} rows</span>
              <div className="shop__pager">
                <button type="button">‹</button>
                <button type="button" className="active">1</button>
                <button type="button">›</button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function showToast(message: string) {
  const id = 'prozone-toast-root';
  let root = document.getElementById(id) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement('div');
    root.id = id;
    root.style.cssText = 'position:fixed;top:16px;right:16px;z-index:9999;display:flex;flex-direction:column;gap:10px;';
    document.body.appendChild(root);
  }
  const toast = document.createElement('div');
  const DANGER = '#e84a3b';
  toast.style.cssText = `display:flex;align-items:center;gap:10px;min-width:280px;max-width:380px;background:${DANGER};color:#fff;border-radius:8px;padding:14px 16px;box-shadow:0 6px 18px rgba(0,0,0,.35);font-family:var(--font-lato),sans-serif;font-size:14px;line-height:1.4;`;
  const icon = document.createElement('span');
  icon.textContent = '✕';
  icon.style.cssText = 'flex:none;width:18px;height:18px;border-radius:50%;background:rgba(0,0,0,.25);color:#fff;font-size:12px;line-height:18px;text-align:center;';
  const msg = document.createElement('span');
  msg.style.cssText = 'flex:1;';
  msg.textContent = message;
  toast.appendChild(icon);
  toast.appendChild(msg);
  root.appendChild(toast);
  const kill = () => toast.remove();
  setTimeout(kill, 4000);
  toast.addEventListener('click', kill);
}

function ShopFieldControl({ field: f }: { field: ShopField }) {
  const label = (
    f.label ? <span className="shop__label">{f.label}{f.required && <em>*</em>}</span> : null
  );
  const accent = f.accent ? { borderColor: '#ed5d15' } : undefined;

  if (f.type === 'fromto') {
    return (
      <div className="shop__field">
        {label}
        <div className="shop__fromto">
          <input type="text" placeholder="From" />
          <input type="text" placeholder="To" />
        </div>
      </div>
    );
  }

  if (f.type === 'bank') {
    return (
      <div className="col-sm-4 col-xs-12">
        <div className="shop__field shop__field--bank">
          {label}
          <div className="shop__bank">
            <input type="text" placeholder="Please select" disabled style={{ border: '2px solid #ff5e02' }} />
            <button
              type="button"
              className="sitebutton orange block min"
              onClick={() => {
                const countrySel = document.querySelector<HTMLSelectElement>('[data-name="country"]');
                const hasCountry = countrySel && countrySel.value && countrySel.value !== 'Please select' && countrySel.selectedIndex > 0;
                if (!hasCountry) {
                  showToast('Select A Country First');
                  return;
                }
                showToast('Banks for selected country loaded');
              }}
            >
              Choose a bank
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (f.type === 'range') {
    return (
      <div className="shop__field">
        {label}
        <div className="shop__range">
          <span>{f.rangeLabel}</span>
          <input type="range" min={0} max={100} defaultValue={100} />
        </div>
      </div>
    );
  }

  if (f.type === 'select') {
    return (
      <div className="shop__field">
        {label}
        <select className="shop__control" data-name={f.name} style={accent}>
          {(f.options ?? ['Please select']).map((o, i) => (
            <option key={o} disabled={i === 0 && !!f.placeholder}>
              {o}
            </option>
          ))}
        </select>
        {f.info && (
          <a className="shop__info" href="#" onClick={(e) => e.preventDefault()}>
            <InfoDot /> {f.info}
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="shop__field">
      {label}
      <input className="shop__control" type="text" placeholder={f.placeholder ?? ''} style={accent} />
      {f.info && (
        <a className="shop__info" href="#" onClick={(e) => e.preventDefault()}>
          <InfoDot /> {f.info}
        </a>
      )}
    </div>
  );
}
