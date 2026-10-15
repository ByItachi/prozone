'use client';

import { useEffect, useState } from 'react';

const SEEN_KEY = 'np-news-seen';

export function NewsPopup() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(SEEN_KEY)) setOpen(true);
    } catch {
      setOpen(true);
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // ignore
    }
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="popup" style={{ paddingTop: 120 }} data-testid="news-popup">
      <div className="popup__wrap max900">
        <button className="popup__close" onClick={dismiss} aria-label="Close" />
        <div className="popup__title">
          news <hr /> ⚠️ NEW TELEGRAM GROUP ⚠️
        </div>
        <div className="popup__block popup__block-center">
          <p>
            <h1>
              <a href="https://t.me/+OKpO3b2M5nxlN2Zk" target="_blank" rel="noopener noreferrer">
                <strong>
                  <em>CLICK HERE FOR NEW TELEGRAM GROUP</em>
                </strong>
              </a>
              <strong>
                <em>
                  <br />
                  <br />
                  ✔️ Old group has been blocked .
                </em>
              </strong>
            </h1>
          </p>
        </div>
        <div className="popup__block flex jcc">
          <a href="#" className="sitebutton maxwidth300 orange" onClick={(e) => { e.preventDefault(); dismiss(); }}>
            UNDERSTOOD
          </a>
        </div>
      </div>
    </div>
  );
}
