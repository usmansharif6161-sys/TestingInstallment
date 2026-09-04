/**
 * scanner.tsx — Universal Device Setup Tab
 * One QR code for all customers. Scan on any new Android phone.
 */

import { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabBar } from '@/components/tab-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  CUSTOMER_ADMIN_COMPONENT,
  getProvisioningConfig,
} from '@/lib/device-owner-provisioning';

// ── Universal Provisioning QR ──────────────────────────────────────────────

const PROVISIONING = getProvisioningConfig();

function buildUniversalQR(): string | null {
  if (!PROVISIONING.isConfigured) {
    return null;
  }

  return JSON.stringify({
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': CUSTOMER_ADMIN_COMPONENT,
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': PROVISIONING.apkDownloadUrl,
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM': PROVISIONING.apkChecksum,
    'android.app.extra.PROVISIONING_SKIP_ENCRYPTION': true,
    'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED': true,
    'android.app.extra.PROVISIONING_LOCALE': 'en_US',
    'android.app.extra.PROVISIONING_TIME_ZONE': 'Asia/Karachi',
    'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE': {
      supabase_url: PROVISIONING.supabaseUrl,
      supabase_key: PROVISIONING.supabaseKey,
    },
  });
}

const UNIVERSAL_QR = buildUniversalQR();

// ── Screen ─────────────────────────────────────────────────────────────────

export default function SetupScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [showFullQR, setShowFullQR] = useState(false);

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView contentContainerStyle={styles.scroll}>

          {/* ── Header ──────────────────────────────────────────── */}
          <View style={styles.header}>
            <ThemedText type="subtitle" style={styles.title}>Device Setup</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              One QR for all customers
            </ThemedText>
          </View>

          {/* ── QR Card ──────────────────────────────────────────── */}
          <View style={[styles.qrCard, { backgroundColor: isDark ? '#0F172A' : '#1E3A8A' }]}>

            {!PROVISIONING.isConfigured ? (
              <View style={styles.warnBanner}>
                <Text style={styles.warnText}>
                  Device setup QR is not ready. Missing: {PROVISIONING.missingFields.join(', ')}
                </Text>
              </View>
            ) : null}

            {/* Badge + title */}
            <View style={styles.qrCardTop}>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>SETUP QR</Text>
              </View>
              <Text style={styles.qrCardTitle}>Universal Device QR</Text>
            </View>

            {/* QR Code */}
            <View style={styles.qrBox}>
              {UNIVERSAL_QR ? (
                <QRCode value={UNIVERSAL_QR} size={210} />
              ) : (
                <View style={styles.qrPlaceholder}>
                  <Text style={styles.placeholderText}>Run npm run apk:upload to generate the setup QR.</Text>
                </View>
              )}
            </View>

            {/* Steps */}
            <View style={styles.stepsRow}>
              {[
                { icon: '📱', label: 'New phone on' },
                { icon: '👆', label: '6x tap screen' },
                { icon: '📷', label: 'Scan this QR' },
                { icon: '✅', label: 'App installs' },
              ].map((s, i) => (
                <View key={i} style={styles.stepItem}>
                  <Text style={{ fontSize: 20 }}>{s.icon}</Text>
                  <Text style={styles.stepLabel}>{s.label}</Text>
                </View>
              ))}
            </View>

            {/* Full screen button */}
            <Pressable style={styles.fullBtn} onPress={() => setShowFullQR(true)}>
              <Text style={styles.fullBtnLabel}>🔍  View Full Screen QR</Text>
            </Pressable>
          </View>

          {/* ── Info ─────────────────────────────────────────────── */}
          <View style={[styles.infoBox, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF' }]}>
            <Text style={[styles.infoTitle, { color: isDark ? '#60A5FA' : '#1D4ED8' }]}>
              After phone setup:
            </Text>
            <Text style={[styles.infoText, { color: isDark ? '#94A3B8' : '#374151' }]}>
              The app will ask the customer to scan their{' '}
              <Text style={{ fontWeight: '700' }}>installment QR</Text>
              {' '}(shown in Dashboard → installment detail).{'\n\n'}
              Once scanned, the app links to that installment and lock mode starts automatically.
            </Text>
          </View>

          {/* ── Share button ─────────────────────────────────────── */}
          <Pressable
            style={styles.shareBtn}
            onPress={() =>
              void Share.share({
                message:
                  'Device Setup Steps:\n\n' +
                  '1. Turn on the new Android phone\n' +
                  '2. Tap 6 times on the welcome screen\n' +
                  '3. Android QR scanner will open\n' +
                  '4. Scan the Setup QR from the shop owner\n' +
                  '5. App will install automatically\n' +
                  '6. Scan your installment QR to link your account',
              })
            }>
            <Text style={styles.shareBtnLabel}>Share Instructions</Text>
          </Pressable>

        </ScrollView>
      </SafeAreaView>

      <TabBar />

      {/* ── Full Screen QR Modal ─────────────────────────────────── */}
      <Modal
        visible={showFullQR}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFullQR(false)}>
        <View style={[modal.root, { backgroundColor: isDark ? '#0D1117' : '#F8FAFC' }]}>
          <SafeAreaView style={{ flex: 1 }}>

            <View style={[modal.header, { borderBottomColor: isDark ? '#1F2937' : '#E5E7EB' }]}>
              <View>
                <Text style={[modal.title, { color: isDark ? '#E2E8F0' : '#0F172A' }]}>
                  Device Setup QR
                </Text>
                <Text style={{ color: isDark ? '#64748B' : '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                  Same for all customers
                </Text>
              </View>
              <Pressable
                style={[modal.closeBtn, { backgroundColor: isDark ? '#1E293B' : '#E5E7EB' }]}
                onPress={() => setShowFullQR(false)}>
                <Text style={{ color: isDark ? '#94A3B8' : '#6B7280', fontWeight: '700' }}>
                  ✕ Close
                </Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={modal.content}>
              <View style={modal.qrWrap}>
                {UNIVERSAL_QR ? (
                  <QRCode value={UNIVERSAL_QR} size={280} />
                ) : (
                  <View style={styles.qrPlaceholder}>
                    <Text style={styles.placeholderText}>
                      Run npm run apk:upload to generate the setup QR.
                    </Text>
                  </View>
                )}
              </View>

              <Text style={[modal.helperText, { color: isDark ? '#64748B' : '#9CA3AF' }]}>
                Show this QR on any new Android phone setup
              </Text>

              <View style={[modal.steps, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF' }]}>
                <Text style={[modal.stepsTitle, { color: isDark ? '#60A5FA' : '#1D4ED8' }]}>
                  Steps:
                </Text>
                {[
                  '1. Turn on new / factory-reset Android phone',
                  '2. Select language on the welcome screen',
                  '3. Tap 6 times anywhere on the screen',
                  '4. Android QR scanner will open',
                  '5. Scan this QR code',
                  '6. App downloads and installs automatically',
                  '7. App becomes Device Owner (cannot be uninstalled)',
                  '8. Customer scans their installment QR inside the app',
                ].map((step, i) => (
                  <Text key={i} style={[modal.step, { color: isDark ? '#CBD5E1' : '#374151' }]}>
                    {step}
                  </Text>
                ))}
              </View>

              <Pressable
                style={modal.shareBtn}
                onPress={() =>
                  void Share.share({
                    message:
                      'Device Setup Steps:\n\n' +
                      '1. Turn on the new Android phone\n' +
                      '2. Tap 6 times on the welcome screen\n' +
                      '3. Scan the Setup QR\n' +
                      '4. App installs automatically\n' +
                      '5. Scan your installment QR inside the app',
                  })
                }>
                <Text style={modal.shareBtnLabel}>Share Instructions</Text>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </ThemedView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1 },
  safe:   { flex: 1 },
  scroll: { gap: Spacing.three, paddingBottom: 100 },
  header: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: 2,
  },
  title: { fontSize: 24, fontWeight: '700' },

  warnBanner: {
    marginHorizontal: Spacing.three,
    backgroundColor: '#7C2D12',
    borderRadius: 12,
    padding: Spacing.two,
  },
  warnText: { color: '#FDBA74', fontSize: 12, lineHeight: 18 },

  // QR Card
  qrCard: {
    marginHorizontal: Spacing.three,
    borderRadius: 20,
    padding: Spacing.three,
    gap: Spacing.three,
    borderWidth: 1,
    borderColor: '#1D4ED8',
  },
  qrCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  badge: {
    backgroundColor: '#2563EB',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  qrCardTitle: {
    color: '#E2E8F0',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  qrBox: {
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: Spacing.three,
    alignSelf: 'center',
  },
  qrPlaceholder: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.four,
  },
  placeholderText: {
    color: '#94A3B8',
    fontSize: 13,
    textAlign: 'center',
  },
  stepsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stepItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  stepLabel: {
    color: '#94A3B8',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  fullBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
  },
  fullBtnLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Info box
  infoBox: {
    marginHorizontal: Spacing.three,
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  infoTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  infoText:  { fontSize: 13, lineHeight: 21 },

  // Share
  shareBtn: {
    marginHorizontal: Spacing.three,
    backgroundColor: '#2563EB',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
  },
  shareBtnLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
});

const modal = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title:    { fontSize: 17, fontWeight: '700' },
  closeBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
  content: {
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: 40,
  },
  qrWrap: {
    backgroundColor: '#fff',
    padding: Spacing.three,
    borderRadius: 16,
  },
  helperText: { fontSize: 13, textAlign: 'center' },
  steps: {
    width: '100%',
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  stepsTitle: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  step:       { fontSize: 13, lineHeight: 22 },
  shareBtn: {
    width: '100%',
    backgroundColor: '#2563EB',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 14,
  },
  shareBtnLabel: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
