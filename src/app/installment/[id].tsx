import { Stack, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGuardedRouter } from '@/hooks/use-guarded-router';
import {
  CUSTOMER_ADMIN_COMPONENT,
  getProvisioningConfig,
} from '@/lib/device-owner-provisioning';
import { formatMoney, resolvePaymentDisplayStatus } from '@/lib/installment';
import { sendSmsLockCommand } from '@/lib/sms-lock';
import { supabase } from '@/lib/supabase';
import { getProductSpecs, type InstallmentWithRelations, type Payment } from '@/lib/types';

// ── Android Enterprise Provisioning QR ─────────────────────────────────────
const PROVISIONING = getProvisioningConfig();

function buildProvisioningQR(qrRef: string): string | null {
  if (!PROVISIONING.isConfigured) {
    return null;
  }

  const payload: Record<string, unknown> = {
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_COMPONENT_NAME': CUSTOMER_ADMIN_COMPONENT,
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_DOWNLOAD_LOCATION': PROVISIONING.apkDownloadUrl,
    'android.app.extra.PROVISIONING_DEVICE_ADMIN_PACKAGE_CHECKSUM': PROVISIONING.apkChecksum,
    'android.app.extra.PROVISIONING_SKIP_ENCRYPTION': true,
    'android.app.extra.PROVISIONING_LEAVE_ALL_SYSTEM_APPS_ENABLED': true,
    'android.app.extra.PROVISIONING_LOCALE': 'en_US',
    'android.app.extra.PROVISIONING_TIME_ZONE': 'Asia/Karachi',
    'android.app.extra.PROVISIONING_ADMIN_EXTRAS_BUNDLE': {
      qr_ref: qrRef,
      supabase_url: PROVISIONING.supabaseUrl,
      supabase_key: PROVISIONING.supabaseKey,
    },
  };

  return JSON.stringify(payload);
}
// ───────────────────────────────────────────────────────────────────────────

export default function InstallmentDetailScreen() {
  const router = useGuardedRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const [installment, setInstallment] = useState<InstallmentWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [lockingTarget, setLockingTarget] = useState<'lock' | 'unlock' | null>(null);
  const [payingPaymentId, setPayingPaymentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showProvisioningQR, setShowProvisioningQR] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('installments')
      .select(
        `
        *,
        customers ( * ),
        products ( * ),
        payments ( * )
      `
      )
      .eq('id', id)
      .single();

    if (fetchError) {
      setError(fetchError.message);
      setInstallment(null);
    } else {
      const row = data as InstallmentWithRelations;
      row.payments = [...(row.payments ?? [])]
        .sort((a, b) => a.installment_number - b.installment_number)
        .map((payment) => ({
          ...payment,
          // Preserve pending_approval — do NOT overwrite with resolvePaymentDisplayStatus
          status: payment.status === 'pending_approval'
            ? 'pending_approval'
            : resolvePaymentDisplayStatus(payment.status, payment.due_date),
        }));
      setInstallment(row);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void load();

    if (!id) return;

    const channel = supabase
      .channel(`installment-${id}-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
          filter: `installment_id=eq.${id}`,
        },
        () => {
          void load();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'installments',
          filter: `id=eq.${id}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, load]);

  async function setLocked(locked: boolean) {
    if (!installment) return;

    if (installment.status === 'completed' && locked) {
      Alert.alert('Completed Sale', 'All installments for this device are complete. Device cannot be locked.');
      return;
    }

    setLockingTarget(locked ? 'lock' : 'unlock');

    const { data, error: updateError } = await supabase
      .from('installments')
      .update({ is_locked: locked })
      .eq('id', installment.id)
      .select('id, is_locked')
      .single();

    setLockingTarget(null);

    if (updateError || !data) {
      Alert.alert(
        locked ? 'Could not lock device' : 'Could not unlock device',
        updateError?.message ?? 'Update failed. Try again.'
      );
      return;
    }

    setInstallment({ ...installment, is_locked: Boolean(data.is_locked) });

    // Cloud Database update (Instant & Silent)
    Alert.alert(
      locked ? 'Lock Signal Sent' : 'Unlock Signal Sent',
      locked
        ? 'Lock signal updated in Cloud Database. Customer device will lock instantly.'
        : 'Unlock signal updated in Cloud Database. Customer device will unlock instantly.'
    );
  }

  function handleSendOfflineSms(locked: boolean) {
    if (!installment?.customers?.phone) {
      Alert.alert('No Phone', 'No customer phone number available for SMS.');
      return;
    }
    void sendSmsLockCommand({
      phone: installment.customers.phone,
      qrCodeRef: installment.qr_code_ref,
      action: locked ? 'LOCK' : 'UNLOCK',
    });
  }

  async function handleApprovePayment(payment: Payment) {
    if (!installment) return;
    setPayingPaymentId(payment.id);
    const paidAt = new Date().toISOString();
    const paymentAmount = Number(payment.amount);
    const newRemaining = Math.max(
      Math.round((Number(installment.remaining_balance) - paymentAmount) * 100) / 100,
      0
    );

    const { error: paymentError } = await supabase
      .from('payments')
      .update({
        status: 'paid',
        paid_at: paidAt,
      })
      .eq('id', payment.id);

    if (paymentError) {
      setPayingPaymentId(null);
      Alert.alert('Approval Failed', paymentError.message);
      return;
    }

    const allOthersPaid = installment.payments
      .filter((p) => p.id !== payment.id)
      .every((p) => p.status === 'paid');

    const isCompleted = allOthersPaid || newRemaining === 0;

    const { error: installmentError } = await supabase
      .from('installments')
      .update({
        remaining_balance: newRemaining,
        status: isCompleted ? 'completed' : 'active',
        ...(isCompleted ? { is_locked: false } : {}),
      })
      .eq('id', installment.id);

    setPayingPaymentId(null);

    if (installmentError) {
      Alert.alert('Approved, but balance update failed', installmentError.message);
    } else {
      Alert.alert(
        'Payment Approved! ✅',
        `Installment #${payment.installment_number} payment approved and marked as Paid.${isCompleted ? ' All installments complete! Device unlocked.' : ''}`
      );
    }

    await load();
  }

  async function handleDeclinePayment(payment: Payment) {
    if (!installment) return;
    setPayingPaymentId(payment.id);

    const { error: paymentError } = await supabase
      .from('payments')
      .update({
        status: 'unpaid',
        paid_at: null,
      })
      .eq('id', payment.id);

    setPayingPaymentId(null);

    if (paymentError) {
      Alert.alert('Decline Failed', paymentError.message);
      return;
    }

    Alert.alert(
      'Payment Declined ❌',
      `Installment #${payment.installment_number} payment request has been declined.`
    );

    await load();
  }

  async function handleShopPay(payment: Payment) {
    if (!installment || payment.status === 'paid') return;

    Alert.alert(
      'Confirm Payment',
      'Do you want to pay this installment this month?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'OK',
          onPress: async () => {
            await handleApprovePayment(payment);
          },
        },
      ]
    );
  }

  const headerElement = (
    <Stack.Screen
      options={{
        title: 'Installment Detail',
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
        headerLeft: () => (
          <Pressable
            hitSlop={12}
            style={{ paddingRight: 14, paddingVertical: 6 }}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace('/');
              }
            }}>
            <ArrowLeft size={22} color={colors.text} />
          </Pressable>
        ),
      }}
    />
  );

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        {headerElement}
        <ActivityIndicator size="large" color="#2563EB" />
      </ThemedView>
    );
  }

  if (error || !installment) {
    return (
      <ThemedView style={styles.centered}>
        {headerElement}
        <ThemedText>{error ?? 'Installment not found'}</ThemedText>
        <Pressable onPress={() => void load()}>
          <ThemedText type="linkPrimary">Retry</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const isCompleted = installment.status === 'completed' || Number(installment.remaining_balance) === 0;
  const isLocked = isCompleted ? false : Boolean(installment.is_locked);
  const provisioningQR = buildProvisioningQR(installment.qr_code_ref);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Installment Detail',
          headerTitleStyle: { fontWeight: '700', fontSize: 18 },
          headerLeft: () => (
            <Pressable
              hitSlop={12}
              style={{ paddingRight: 14, paddingVertical: 6 }}
              onPress={() => {
                if (router.canGoBack()) {
                  router.back();
                } else {
                  router.replace('/');
                }
              }}>
              <ArrowLeft size={22} color={colors.text} />
            </Pressable>
          ),
        }}
      />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <ScrollView contentContainerStyle={styles.content}>


          {/* ── Lock / Unlock Panel ─────────────────────────────────── */}
          <View style={[styles.lockPanel, { backgroundColor: colors.backgroundElement }]}>
            <ThemedText type="smallBold">
              Customer device: {isLocked ? 'LOCKED' : 'UNLOCKED'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Lock / Unlock controls the customer phone. Full system lock works only on
              shop phones set as Android Device Owner (see installment-customer setup).
            </ThemedText>
            <View style={styles.lockActions}>
              {isLocked ? (
                <Pressable
                  style={[styles.lockBtn, styles.lockBtnGrow, { backgroundColor: '#2563EB' }, Boolean(lockingTarget) && styles.disabled]}
                  disabled={Boolean(lockingTarget)}
                  onPress={() => void setLocked(false)}>
                  {lockingTarget === 'unlock' ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <ThemedText type="smallBold" style={styles.unlockLabel}>
                      Unlock Device
                    </ThemedText>
                  )}
                </Pressable>
              ) : (
                <Pressable
                  style={[styles.lockBtn, styles.lockBtnGrow, { backgroundColor: '#2563EB' }, Boolean(lockingTarget) && styles.disabled]}
                  disabled={Boolean(lockingTarget)}
                  onPress={() => void setLocked(true)}>
                  {lockingTarget === 'lock' ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <ThemedText type="smallBold" style={styles.lockLabel}>
                      Lock Device
                    </ThemedText>
                  )}
                </Pressable>
              )}
            </View>
          </View>

          {/* ── Installment QR (existing app scan) ─────────────────── */}
          <View style={[styles.qrCard, { backgroundColor: colors.backgroundElement }]}>
            <ThemedText type="smallBold">Installment QR (existing app)</ThemedText>
            <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
              If app is already installed on customer's device, ask them to scan this QR
            </ThemedText>
            <QRCode value={installment.qr_code_ref} size={180} />
            <ThemedText type="smallBold" style={styles.qrRef}>
              {installment.qr_code_ref}
            </ThemedText>
            <Pressable
              style={styles.shareButton}
              onPress={() =>
                void Share.share({
                  message: `Installment QR: ${installment.qr_code_ref}`,
                })
              }>
              <ThemedText type="smallBold" style={styles.shareLabel}>
                Share QR Reference
              </ThemedText>
            </Pressable>
          </View>

          {/* ── Customer & Product Info ─────────────────────────────── */}
          <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
            <ThemedText type="smallBold">{installment.customers?.name ?? 'Customer'}</ThemedText>
            {installment.customers?.cnic ? (
              <ThemedText type="small" themeColor="textSecondary">
                🪪 CNIC: {installment.customers.cnic}
              </ThemedText>
            ) : null}
            <ThemedText type="small">📞 Mobile: {installment.customers?.phone}</ThemedText>
            {installment.customers?.alternate_phone ? (
              <ThemedText type="small" themeColor="textSecondary">
                📱 Alt: {installment.customers.alternate_phone}
              </ThemedText>
            ) : null}
            {installment.customers?.address ? (
              <ThemedText type="small" themeColor="textSecondary">
                📍 Address: {installment.customers.address}
              </ThemedText>
            ) : null}
            <ThemedText type="small" style={styles.mt}>
              Product: {installment.products?.name}
            </ThemedText>
            {installment.products ? (() => {
              const specs = getProductSpecs(installment.products);
              const sub = [specs.ram ? `${specs.ram} RAM` : '', specs.storage ? `${specs.storage} Storage` : '', specs.color ? `Color: ${specs.color}` : '', specs.imei ? `IMEI: ${specs.imei}` : ''].filter(Boolean).join(' · ');
              return sub ? <ThemedText type="small" themeColor="textSecondary">{sub}</ThemedText> : null;
            })() : null}
            <ThemedText type="small">Total: {formatMoney(installment.product_price)}</ThemedText>
            <ThemedText type="small">Down: {formatMoney(installment.down_payment)}</ThemedText>
            <ThemedText type="small">
              Remaining: {formatMoney(installment.remaining_balance)}
            </ThemedText>
          </View>

          {/* ── Payment Schedule ────────────────────────────────────── */}
          <ThemedText type="smallBold">Payment Schedule</ThemedText>
          {installment.payments.map((payment) => (
            <PaymentScheduleRow
              key={payment.id}
              payment={payment}
              colors={colors}
              onPay={handleShopPay}
              onApprove={handleApprovePayment}
              onDecline={handleDeclinePayment}
              payingId={payingPaymentId}
            />
          ))}
        </ScrollView>
      </SafeAreaView>

      {/* ── Provisioning QR Full-Screen Modal ──────────────────────── */}
      <Modal
        visible={showProvisioningQR}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowProvisioningQR(false)}>
        <View style={styles.modalRoot}>
          <SafeAreaView style={styles.modalSafe}>
            <View style={styles.modalHeader}>
              <ThemedText type="smallBold" style={styles.modalTitle}>
                📱 Device Setup QR
              </ThemedText>
              <Pressable
                style={styles.closeBtn}
                onPress={() => setShowProvisioningQR(false)}>
                <ThemedText type="smallBold" style={styles.closeBtnLabel}>
                  ✕ Close
                </ThemedText>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              {/* Big QR */}
              <View style={styles.bigQRWrap}>
                {provisioningQR ? (
                  <QRCode value={provisioningQR} size={260} />
                ) : (
                  <View style={styles.qrPlaceholder}>
                    <ThemedText type="smallBold" style={styles.placeholderTitle}>
                      APK upload required
                    </ThemedText>
                    <ThemedText type="small" style={styles.placeholderText}>
                      Missing: {PROVISIONING.missingFields.join(', ')}
                    </ThemedText>
                  </View>
                )}
              </View>

              <ThemedText type="smallBold" style={styles.modalClientName}>
                {installment.customers?.name ?? 'Customer'}
              </ThemedText>
              <ThemedText type="small" style={styles.modalRef}>
                {installment.qr_code_ref}
              </ThemedText>

              {/* Instructions */}
              <View style={styles.instructionBox}>
                <ThemedText type="smallBold" style={styles.instrTitle}>
                  Steps for New Device Setup:
                </ThemedText>
                {[
                  '1. Turn on device (new / factory reset)',
                  '2. Select language on Welcome screen',
                  '3. Tap 6 times anywhere on the next screen',
                  '4. Android QR scanner will open',
                  '5. Scan this QR code',
                  '6. Android will automatically download + install the app',
                  '7. App becomes Device Owner (cannot be uninstalled)',
                  '8. App starts in lock mode with installment data',
                ].map((step, i) => (
                  <ThemedText key={i} type="small" style={styles.instrStep}>
                    {step}
                  </ThemedText>
                ))}
              </View>

              {/* Warning if APK not uploaded yet */}
              {!PROVISIONING.isConfigured ? (
                <View style={styles.warningBox}>
                  <ThemedText type="smallBold" style={styles.warningTitle}>
                    ⚠️ APK Upload Required
                  </ThemedText>
                  <ThemedText type="small" style={styles.warningText}>
                    Run this command in the installment-customer folder:
                    {'\n\n  '}npm run apk:upload{'\n\n'}
                    This will build the APK and upload it to Supabase Storage, then automatically update the .env files.
                  </ThemedText>
                </View>
              ) : null}

              <Pressable
                style={styles.shareProvBtn}
                onPress={() =>
                  void Share.share({
                    message: `Device Setup — scan this QR on new Android:\n\nClient: ${installment.customers?.name
                      }\nRef: ${installment.qr_code_ref}`,
                  })
                }>
                <ThemedText type="smallBold" style={styles.shareProvLabel}>
                  Share Instructions
                </ThemedText>
              </Pressable>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </ThemedView>
  );
}

function PaymentScheduleRow({
  payment,
  colors,
  onPay,
  onApprove,
  onDecline,
  payingId,
}: {
  payment: Payment;
  colors: (typeof Colors)['light'] | (typeof Colors)['dark'];
  onPay?: (payment: Payment) => void;
  onApprove?: (payment: Payment) => void;
  onDecline?: (payment: Payment) => void;
  payingId?: string | null;
}) {
  const isPaid = payment.status === 'paid';
  const isPendingApproval = payment.status === 'pending_approval';
  const displayStatus = resolvePaymentDisplayStatus(payment.status, payment.due_date);
  const isPaying = payingId === payment.id;

  return (
    <View style={[styles.paymentCard, { backgroundColor: colors.backgroundElement }]}>
      {/* Top Row: Info + Status Badge */}
      <View style={styles.paymentRowHeader}>
        <View style={styles.paymentInfo}>
          <ThemedText type="smallBold">
            #{payment.installment_number} · {formatMoney(payment.amount)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Due {payment.due_date}
            {payment.paid_at ? ` · Paid ${new Date(payment.paid_at).toLocaleDateString()}` : ''}
          </ThemedText>
        </View>

        {isPaid ? (
          <View style={styles.paidBadge}>
            <Text style={styles.paidBadgeText}>PAID ✓</Text>
          </View>
        ) : isPendingApproval ? (
          <View style={styles.pendingBadge}>
            <Text style={styles.pendingBadgeText}>⏳ PENDING</Text>
          </View>
        ) : displayStatus === 'overdue' ? (
          <View style={styles.overdueBadge}>
            <Text style={styles.overdueBadgeText}>OVERDUE</Text>
          </View>
        ) : (
          <View style={styles.unpaidBadge}>
            <Text style={styles.unpaidBadgeText}>UNPAID</Text>
          </View>
        )}
      </View>

      {/* Pending Approval: Verify button */}
      {isPendingApproval ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Pressable
            style={[styles.approveBtn, { flex: 1 }, isPaying && { opacity: 0.6 }]}
            disabled={isPaying}
            onPress={() => onApprove?.(payment)}>
            {isPaying ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.approveBtnText}>Verify</Text>
            )}
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safe: { flex: 1, paddingHorizontal: Spacing.three },
  content: { gap: Spacing.three, paddingVertical: Spacing.three, paddingBottom: Spacing.six },

  // ── Provisioning Card ───────────────────────────────────────────
  provisionCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    borderWidth: 1,
    borderColor: '#1D4ED8',
  },
  provisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  provisionBadge: {
    backgroundColor: '#1D4ED8',
    borderRadius: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
  },
  provisionBadgeText: { color: '#fff', fontSize: 10 },
  provisionTitle: { color: '#E2E8F0', flex: 1 },
  provisionDesc: { color: '#94A3B8', lineHeight: 20 },
  highlight: { color: '#60A5FA' },
  stepsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, marginTop: Spacing.one },
  stepItem: {
    alignItems: 'center',
    gap: 2,
    minWidth: 72,
    flex: 1,
  },
  stepIcon: { fontSize: 20 },
  stepText: { color: '#94A3B8', fontSize: 10, textAlign: 'center' },
  showQRBtn: {
    backgroundColor: '#1D4ED8',
    borderRadius: Spacing.two,
    alignItems: 'center',
    paddingVertical: Spacing.three,
    marginTop: Spacing.one,
  },
  showQRLabel: { color: '#fff' },
  provisionNote: { color: '#475569', textAlign: 'center', fontSize: 11 },

  // ── Lock Panel ──────────────────────────────────────────────────
  lockPanel: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  lockPanelText: { color: '#fff' },
  lockPanelMuted: { color: '#FECACA' },
  lockActions: { flexDirection: 'row', gap: Spacing.two },
  lockBtnGrow: { flex: 1, minHeight: 48, justifyContent: 'center' },
  lockBtn: {
    backgroundColor: '#111827',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  lockLabel: { color: '#fff' },
  unlockBtn: {
    backgroundColor: '#059669',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
  },
  unlockLabel: { color: '#fff' },

  // ── Installment QR ──────────────────────────────────────────────
  qrCard: {
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Spacing.three,
  },
  qrRef: { textAlign: 'center' },
  center: { textAlign: 'center' },
  shareButton: {
    marginTop: Spacing.two,
    backgroundColor: '#1A73E8',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  shareLabel: { color: '#fff' },

  // ── Customer / Product Card ─────────────────────────────────────
  card: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  mt: { marginTop: Spacing.two },

  // ── Payment Row ─────────────────────────────────────────────────
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.two,
  },
  paymentInfo: { flex: 1, gap: Spacing.half },

  // ── Shared ──────────────────────────────────────────────────────
  disabled: { opacity: 0.45 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
  },

  // ── Modal ───────────────────────────────────────────────────────
  modalRoot: { flex: 1, backgroundColor: '#0F172A' },
  modalSafe: { flex: 1 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  modalTitle: { color: '#E2E8F0', fontSize: 16 },
  closeBtn: {
    backgroundColor: '#1E293B',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  closeBtnLabel: { color: '#94A3B8' },
  modalContent: {
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  bigQRWrap: {
    backgroundColor: '#fff',
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  qrPlaceholder: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    borderRadius: Spacing.three,
    backgroundColor: '#0F172A',
  },
  placeholderTitle: { color: '#FED7AA', textAlign: 'center' },
  placeholderText: { color: '#FDBA74', textAlign: 'center' },
  modalClientName: { color: '#E2E8F0', fontSize: 18, textAlign: 'center' },
  modalRef: { color: '#64748B', textAlign: 'center' },
  instructionBox: {
    backgroundColor: '#1E293B',
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
    width: '100%',
  },
  instrTitle: { color: '#60A5FA' },
  instrStep: { color: '#CBD5E1' },
  warningBox: {
    backgroundColor: '#7C2D12',
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.one,
    width: '100%',
    borderWidth: 1,
    borderColor: '#EA580C',
  },
  warningTitle: { color: '#FED7AA' },
  warningText: { color: '#FDBA74' },
  shareProvBtn: {
    backgroundColor: '#1D4ED8',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    width: '100%',
  },
  shareProvLabel: { color: '#fff' },
  paymentCard: {
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  paymentRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shopPayBtnBlock: {
    backgroundColor: '#2563EB',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  shopPayBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  paidBadge: {
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  paidBadgeText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
  },
  pendingBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#D97706',
  },
  pendingBadgeText: {
    color: '#B45309',
    fontSize: 12,
    fontWeight: '700',
  },
  unpaidBadge: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  unpaidBadgeText: {
    color: '#D97706',
    fontSize: 12,
    fontWeight: '700',
  },
  overdueBadge: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  overdueBadgeText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '700',
  },
  approveBtn: {
    flex: 1,
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  declineBtn: {
    flex: 1,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
