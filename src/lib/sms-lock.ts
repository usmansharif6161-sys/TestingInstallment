import { Linking } from 'react-native';

/**
 * Formats and dispatches a silent background SMS payload to lock or unlock
 * a customer device without requiring Wi-Fi / Mobile Data connection.
 *
 * Payload Format:
 *   LOCK_APP_CMD:<qr_ref>:LOCK
 *   LOCK_APP_CMD:<qr_ref>:UNLOCK
 */
export async function sendSmsLockCommand({
  phone,
  qrCodeRef,
  action,
}: {
  phone?: string | null;
  qrCodeRef: string;
  action: 'LOCK' | 'UNLOCK';
}): Promise<boolean> {
  const cleanPhone = (phone ?? '').replace(/[^0-9+]/g, '');
  const payload = `LOCK_APP_CMD:${qrCodeRef}:${action}`;

  if (!cleanPhone) {
    console.warn('[SmsLock] No valid customer phone number provided.');
    return false;
  }

  try {
    const url = `sms:${cleanPhone}?body=${encodeURIComponent(payload)}`;
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
      return true;
    } else {
      console.warn('[SmsLock] SMS URL scheme cannot be opened on this device.');
      return false;
    }
  } catch (err) {
    console.error('[SmsLock] Error sending SMS lock command:', err);
    return false;
  }
}
