'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { RefreshCw } from 'lucide-react';
import { AuthField } from '@/components/auth-field';

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function generateCaptcha() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export function captchaImage(code: string) {
  const W = 200;
  const H = 60;
  const colors = ['#ed5d15', '#ff5e02', '#d85311', '#f2711c'];
  const lineColor = 'rgba(237,93,21,0.35)';
  const dotColor = 'rgba(237,93,21,0.25)';
  const step = W / (code.length + 0.5);
  let glyphs = '';
  for (let i = 0; i < code.length; i += 1) {
    const x = step * (i + 0.6);
    const y = randomInt(38, 46);
    const rot = randomInt(-28, 28);
    const fs = randomInt(28, 34);
    const color = colors[randomInt(0, colors.length - 1)];
    glyphs += `<text x="${x}" y="${y}" font-family="Lato, Verdana, monospace" font-size="${fs}" font-weight="700" fill="${color}" transform="rotate(${rot} ${x} ${y})">${code[i]}</text>`;
  }
  let noise = '';
  for (let i = 0; i < 5; i += 1) {
    noise += `<path d="M${randomInt(0, W)} ${randomInt(0, H)} Q ${randomInt(0, W)} ${randomInt(0, H)} ${randomInt(0, W)} ${randomInt(0, H)}" stroke="${lineColor}" fill="none" stroke-width="1.2"/>`;
  }
  for (let i = 0; i < 24; i += 1) {
    noise += `<circle cx="${randomInt(0, W)}" cy="${randomInt(0, H)}" r="${randomInt(1, 2)}" fill="${dotColor}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#ffffff"/>${glyphs}${noise}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function CaptchaField({
  id = 'captcha',
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    setSrc(captchaImage(generateCaptcha()));
  }, []);

  return (
    <div className="grid grid-cols-2 gap-[18px]">
      <button
        type="button"
        onClick={() => setSrc(captchaImage(generateCaptcha()))}
        title="Refresh captcha"
        className="auth-captcha group relative flex h-[60px] items-center justify-center gap-2 overflow-hidden rounded-[10px] border border-[#d7d7d7] bg-white transition-colors"
      >
        {src ? (
          <Image
            src={src}
            alt="Captcha"
            width={200}
            height={60}
            unoptimized
            className="h-[44px] w-auto select-none"
            draggable={false}
          />
        ) : (
          <span className="text-sm text-[#10202d]/40">Loading…</span>
        )}
        <RefreshCw className="absolute right-2 h-4 w-4 shrink-0 text-[#10202d]/40 group-hover:text-[#10202d]/70" />
      </button>
      <AuthField
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter Captcha"
        autoComplete="off"
        className="!pl-[15px]"
      />
    </div>
  );
}
