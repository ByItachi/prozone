'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, KeyRound, Loader2, Save } from 'lucide-react';
import { api, getErrorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();

  const [profile, setProfile] = useState({
    name: user?.name ?? '',
    surname: user?.surname ?? '',
    username: user?.username ?? '',
    email: user?.email ?? '',
  });
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  const handleProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api('/api/users/me', {
        method: 'PATCH',
        body: JSON.stringify(profile),
      });
      await refreshUser();
      toast.success('Profile updated', { position: 'top-center' });
    } catch (err) {
      toast.error(getErrorMessage(err), { position: 'top-center' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== newPasswordConfirmation) {
      toast.error('New passwords do not match', { position: 'top-center' });
      return;
    }
    setSavingPassword(true);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirmation('');
      toast.success('Password changed', { position: 'top-center' });
    } catch (err) {
      toast.error(getErrorMessage(err), { position: 'top-center' });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile information and password.</p>
      </div>

      <form onSubmit={handleProfile} className="space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold">Profile Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="name">First Name</Label>
            <Input id="name" value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="surname">Last Name</Label>
            <Input id="surname" value={profile.surname} onChange={(e) => setProfile((p) => ({ ...p, surname: e.target.value }))} className="mt-1.5" />
          </div>
        </div>
        <div>
          <Label htmlFor="username">Username</Label>
          <Input id="username" value={profile.username} onChange={(e) => setProfile((p) => ({ ...p, username: e.target.value }))} className="mt-1.5" />
        </div>
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} className="mt-1.5" />
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Changing your email may require re-verification.
          </p>
        </div>
        <Button type="submit" disabled={savingProfile}>
          {savingProfile ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save
        </Button>
      </form>

      <form onSubmit={handlePassword} className="space-y-4 rounded-xl border border-border bg-card p-6">
        <h2 className="flex items-center gap-2 font-semibold">
          <KeyRound className="h-4 w-4 text-primary" />
          Change Password
        </h2>
        <div>
          <Label htmlFor="currentPassword">Current Password</Label>
          <Input id="currentPassword" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1.5" autoComplete="current-password" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="newPassword">New Password</Label>
            <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1.5" autoComplete="new-password" />
          </div>
          <div>
            <Label htmlFor="newPasswordConfirmation">Confirm New Password</Label>
            <Input id="newPasswordConfirmation" type="password" value={newPasswordConfirmation} onChange={(e) => setNewPasswordConfirmation(e.target.value)} className="mt-1.5" autoComplete="new-password" />
          </div>
        </div>
        <Button type="submit" variant="outline" disabled={savingPassword}>
          {savingPassword ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Update Password
        </Button>
      </form>
    </div>
  );
}