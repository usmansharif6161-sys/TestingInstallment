/**
 * Form validation utilities for Shop Owner & Customer Apps
 */

export function isValidEmail(email: string): boolean {
  const trimmed = email.trim();
  if (!trimmed) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  // Accepts Pakistani local numbers (03xx xxx xxxx = 11 digits) or international (+92 3xx xxx xxxx = 12 digits)
  return digits.length >= 10 && digits.length <= 12;
}

export function isValidCNIC(cnic: string): boolean {
  const digits = cnic.replace(/\D/g, '');
  return digits.length === 13;
}

export function isValidIMEI(imei: string): boolean {
  const digits = imei.replace(/\D/g, '');
  return digits.length === 15;
}

/**
 * Automatically formats 13-digit raw string to CNIC format: XXXXX-XXXXXXX-X
 */
export function formatCNIC(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 13);
  if (digits.length <= 5) return digits;
  if (digits.length <= 12) return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}

/**
 * Automatically formats Pakistani phone number
 */
export function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 4)}-${digits.slice(4)}`;
}
