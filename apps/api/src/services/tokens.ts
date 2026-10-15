import { randomBytes, createHash } from 'node:crypto';

export function generateOpaqueToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(3).toString('hex').toUpperCase();
  return `NP-${ts.slice(-6)}-${rand}`;
}

export function generateInvoiceNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(2).toString('hex').toUpperCase();
  return `INV-${ts.slice(-6)}-${rand}`;
}

export function generateTicketNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(3).toString('hex').toUpperCase();
  return `TK-${ts.slice(-6)}-${rand}`;
}

export function generateBackupCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < 10; i++) {
    codes.push(
      `${randomInt(0, 1000000).toString().padStart(6, '0')}-${randomInt(0, 1000000)
        .toString()
        .padStart(6, '0')}`,
    );
  }
  return codes;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min)) + min;
}