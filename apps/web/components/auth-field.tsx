'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { useAuthTheme } from '@/components/auth-shell';

export interface AuthFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ComponentType<{ className?: string }>;
}

const AuthField = React.forwardRef<HTMLInputElement, AuthFieldProps>(
  ({ className, icon: Icon, ...props }, ref) => {
    const dark = useAuthTheme();
    return (
      <div className="relative">
        {Icon && (
          <span className="pointer-events-none absolute left-[20px] top-1/2 -translate-y-1/2">
            <Icon className={cn('h-[21px] w-[21px]', dark ? 'text-white' : 'text-[#242c36]/60')} />
          </span>
        )}
        <input
          ref={ref}
          className={cn(
            'block h-[60px] w-full rounded-[10px] border pl-[55px] pr-[20px] text-[18px] outline-none transition-all duration-300',
            dark
              ? 'border-[#272a34] bg-transparent text-white placeholder:text-white focus:border-[#ed5d15]'
              : 'border-[#d7d7d7] bg-white text-[#242c36] opacity-70 placeholder:text-[#242c36] focus:border-[#ff5e02] focus:opacity-100 focus:shadow-[0_0_10px_0_rgba(255,94,2,0.45)]',
            className,
          )}
          {...props}
        />
      </div>
    );
  },
);
AuthField.displayName = 'AuthField';

export { AuthField };