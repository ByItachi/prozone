'use client';

import * as React from 'react';
import Image from 'next/image';
import { Play } from 'lucide-react';
import { cn } from '@/lib/utils';

const links = [
  {
    href: 'https://telegra.ph/HOW-TO-GET-A-DIRECT-ACCESS-LINK-05-13',
    icon: '/direct-1.svg',
    label: 'Text Tutorial',
    title: 'How to get a direct link',
  },
  {
    href: 'https://prozone.media/w/4CBo3mfyvuSZ5CWCiytfTc',
    icon: '/direct-2.svg',
    label: 'Video Tutorial',
    title: 'How to get a direct link',
  },
  {
    href: 'https://prozone.media/w/attjRqPA9aJ2tdFGNTYPQm',
    icon: '/direct-3.svg',
    label: 'Video Tutorial',
    title: 'APP FOR IOS',
  },
  {
    href: 'https://prozone.media/w/7RqaDew1jcfMm2jTJwhZTJ',
    icon: '/direct-4.svg',
    label: 'Video Tutorial',
    title: 'APP FOR ANDROID',
  },
];

function InfoIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="h-[16px] w-[16px] shrink-0 fill-current"
    >
      <path d="M15.6676 11.9982L10.0155 1.60829C9.10745 0.079504 6.89379 0.0774728 5.98448 1.60829L0.33273 11.9982C-0.595582 13.5603 0.528324 15.5385 2.34779 15.5385H13.652C15.47 15.5385 16.5959 13.5619 15.6676 11.9982ZM8.00001 13.6635C7.4832 13.6635 7.06251 13.2428 7.06251 12.726C7.06251 12.2092 7.4832 11.7885 8.00001 11.7885C8.51682 11.7885 8.93751 12.2092 8.93751 12.726C8.93751 13.2428 8.51682 13.6635 8.00001 13.6635ZM8.93751 9.9135C8.93751 10.4303 8.51682 10.851 8.00001 10.851C7.4832 10.851 7.06251 10.4303 7.06251 9.9135L7.06251 5.226C7.06251 4.70919 7.4832 4.2885 8.00001 4.2885C8.51682 4.2885 8.93751 4.70919 8.93751 5.226V9.9135Z" />
    </svg>
  );
}

export default function DirectAccessPage() {
  const [dark, setDark] = React.useState(true);
  const [showVideo, setShowVideo] = React.useState(true);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('np-auth-theme');
      if (saved) setDark(saved === 'dark');
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    try {
      localStorage.setItem('np-auth-theme', dark ? 'dark' : 'light');
    } catch {
      // ignore
    }
  }, [dark]);

  return (
    <div
      className={cn('relative min-h-screen w-full', dark ? 'dark_theme' : '')}
      style={{ backgroundColor: dark ? '#0b151e' : '#f9f9f9', color: dark ? '#fff' : '#242c36' }}
    >
      {/* Theme toggle (.main__theme) */}
      <button
        type="button"
        onClick={() => setDark((v) => !v)}
        title="Theme"
        aria-label="Toggle theme"
        className={cn(
          'absolute right-[40px] top-[40px] z-20 flex h-[40px] w-[40px] items-center justify-center rounded-[10px] border transition-colors',
          dark
            ? 'border-white/10 bg-[#0f131e] text-white hover:bg-[#162027]'
            : 'border-[rgba(15,19,30,0.1)] bg-white text-[#1a2833] hover:bg-black/5',
        )}
      >
        <Image src="/theme-l.svg" alt="" width={18} height={19} className={cn('h-[18px] w-[18px]', !dark && 'brightness-0')} />
      </button>

      {/* .main */}
      <div className="flex items-center justify-center px-[25px] pb-[15px] pt-[30px] md:px-5 md:pb-[25px] md:pt-[50px]">
        {/* .direct */}
        <div className="w-full pt-[100px] text-center">
          {/* .direct__wrap */}
          <div className="mx-auto flex w-full max-w-[830px] flex-col px-[15px] text-center">
            {/* .direct__top */}
            <div className="w-full">
              {/* .direct__logo */}
              <Image
                src={dark ? '/direct-logo-l.svg' : '/direct-logo-d.svg'}
                alt="Prozone"
                width={327}
                height={70}
                priority
                className="mx-auto h-auto w-[185px]"
              />

              {/* .direct__title */}
              <h1 className="mt-[50px] font-display text-[40px] font-normal leading-[40px] md:mt-[80px] md:text-[70px] md:leading-[70px]">
                FOR FEW HOURS PROZONE WILL WORK ONLY THROUGH{' '}
                <span className="text-[#ed5d15]">DIRECT ACCESS LINK</span>
              </h1>

              {/* .direct__block (text + info) */}
              <div className="mt-[40px]">
                <div className="mx-auto mb-[20px] max-w-[500px] text-[14px] md:text-[16px]">
                  Look below tutorials how to activate it! Direct Access Links much safer &amp; easy to use it will never
                  require MDS!
                </div>
                <div className="flex justify-center">
                  <div
                    className={cn(
                      'inline-flex items-center gap-[5px] rounded-[5px] border-2 border-[#ff5e02] px-[10px] py-[5px] text-[16px]',
                      dark ? 'bg-black text-white' : 'bg-white text-[#242c36]',
                    )}
                  >
                    <InfoIcon />
                    Regular domain will work in few hours
                  </div>
                </div>
              </div>

              {/* .direct__block (links) */}
              <div className="mt-[40px]">
                <div className="mx-auto max-w-[570px]">
                  <div className="flex flex-wrap justify-center gap-y-[10px]">
                    {links.map((link) => (
                      <div key={link.href} className="w-[66.667%] px-[5px] md:w-1/2">
                        <a
                          href={link.href}
                          target="__blank"
                          rel="noreferrer"
                          className={cn(
                            'flex items-center gap-[8px] rounded-[10px] border px-[20px] py-[15px] text-left text-[12px] font-light leading-[14.4px] transition-colors',
                            dark
                              ? 'border-[#324251] bg-[#0c161e] text-white hover:bg-[#111f2b]'
                              : 'border-white bg-[#f4f4f4] text-[#242c36] hover:bg-[#ededed]',
                          )}
                        >
                          <span className="block h-[30px] w-[30px] shrink-0">
                            <Image src={link.icon} alt="" width={30} height={30} className="h-[30px] w-[30px]" />
                          </span>
                          <span className="block text-[12px] font-light leading-[14.4px]">
                            {link.label}
                            <span className="block text-[14px] font-normal leading-[16.8px]">{link.title}</span>
                          </span>
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* .direct__img */}
            <div className="mt-[35px]">
              <Image
                src="/direct-illustration.png"
                alt=""
                width={630}
                height={470}
                className="mx-auto h-auto w-auto max-w-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Video instruction frame (.fixVideo__frame) */}
      {showVideo && (
        <div className="absolute bottom-[35px] right-[35px] z-10 hidden w-[320px] lg:block">
          <button
            type="button"
            onClick={() => setShowVideo(false)}
            aria-label="Close video"
            className="absolute right-0 top-[-32px] h-[20px] w-[20px]"
          >
            <Image src="/closevideo.svg" alt="Close" width={20} height={20} className="h-[20px] w-[20px] opacity-70 transition-opacity hover:opacity-100" />
          </button>
          <div className="relative overflow-hidden rounded-[10px]">
            <Image src="/videoimg.png" alt="Video instruction" width={640} height={400} className="block h-auto w-full" />
            <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(26,40,51,0.8),rgba(26,40,51,0.8))]" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-[8px] px-6 text-center text-white">
              <span className="flex h-[40px] w-[56px] items-center justify-center rounded-[10px] bg-[#ed5d15]">
                <Play className="h-[18px] w-[18px] fill-white text-white" />
              </span>
              <span className="font-display text-[24px] font-normal leading-none">Video instruction</span>
              <span className="font-display text-[24px] font-bold leading-none">How to get Direct Access Link</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
