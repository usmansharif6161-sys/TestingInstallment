const CUSTOMER_APP_PACKAGE = 'com.installment.customer';

const DEFAULT_APK_DOWNLOAD_URL =
  'https://your-project.supabase.co/storage/v1/object/public/apks/installment-customer.apk';

const DEFAULT_APK_CHECKSUM = 'REPLACE_AFTER_RUNNING_apk_upload';

export const CUSTOMER_ADMIN_COMPONENT = `${CUSTOMER_APP_PACKAGE}/${CUSTOMER_APP_PACKAGE}.DeviceAdminReceiver`;

export type ProvisioningConfig = {
  apkDownloadUrl: string;
  apkChecksum: string;
  supabaseUrl: string;
  supabaseKey: string;
  isConfigured: boolean;
  missingFields: string[];
};

export function getProvisioningConfig(): ProvisioningConfig {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
  const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const apkDownloadUrl = process.env.EXPO_PUBLIC_APK_URL ?? '';
  const apkChecksum = process.env.EXPO_PUBLIC_APK_CHECKSUM ?? '';

  const missingFields: string[] = [];

  if (!supabaseUrl) missingFields.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!supabaseKey) missingFields.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!apkDownloadUrl || apkDownloadUrl === DEFAULT_APK_DOWNLOAD_URL) {
    missingFields.push('EXPO_PUBLIC_APK_URL');
  }
  if (!apkChecksum || apkChecksum === DEFAULT_APK_CHECKSUM) {
    missingFields.push('EXPO_PUBLIC_APK_CHECKSUM');
  }

  return {
    apkDownloadUrl,
    apkChecksum,
    supabaseUrl,
    supabaseKey,
    isConfigured: missingFields.length === 0,
    missingFields,
  };
}
