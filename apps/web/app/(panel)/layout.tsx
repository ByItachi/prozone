import { DashboardLayout } from '@/components/dashboard-layout';

export const metadata = { title: 'Panel' };

export default function DashboardPageLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}