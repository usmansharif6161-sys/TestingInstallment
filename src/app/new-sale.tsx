import { useLocalSearchParams } from 'expo-router';
import { ChevronDown, Smartphone } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabBar } from '@/components/tab-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGuardedRouter } from '@/hooks/use-guarded-router';
import { buildInstallmentSchedule, formatMoney } from '@/lib/installment';
import { supabase } from '@/lib/supabase';
import { getProductSpecs, type Product } from '@/lib/types';
import { formatCNIC, isValidCNIC, isValidPhone } from '@/lib/validation';

const ACCENT_COLORS = [
  '#2563EB', '#7C3AED', '#059669', '#DC2626',
  '#D97706', '#0891B2', '#DB2777', '#65A30D',
];
function accentFor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return ACCENT_COLORS[Math.abs(h) % ACCENT_COLORS.length];
}

export default function NewSaleScreen() {
  const router = useGuardedRouter();
  const params = useLocalSearchParams<{ productId?: string }>();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const isDark = scheme === 'dark';
  const { user, profile } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState(params.productId ?? '');
  const [productSearch, setProductSearch] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [cnic, setCnic] = useState('');
  const [phone, setPhone] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [address, setAddress] = useState('');
  const [downPayment, setDownPayment] = useState('0');
  const [numberOfInstallments, setNumberOfInstallments] = useState('3');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === productId) ?? null,
    [products, productId]
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q)
    );
  }, [products, productSearch]);

  const preview = useMemo(() => {
    if (!selectedProduct) return null;
    const down = Number(downPayment) || 0;
    const count = Number(numberOfInstallments) || 0;
    const remaining = Math.max(Number(selectedProduct.price) - down, 0);
    if (count <= 0) return null;
    try {
      const { amounts, dueDates } = buildInstallmentSchedule({
        remainingBalance: remaining,
        numberOfInstallments: count,
      });
      return {
        remaining,
        amounts,
        dueDates,
        monthlyAmount: amounts[0] ?? 0,
      };
    } catch { return null; }
  }, [selectedProduct, downPayment, numberOfInstallments]);

  const loadProducts = useCallback(async () => {
    let query = supabase.from('products').select('*').order('name');
    if (user?.id) query = query.eq('user_id', user.id);

    const { data, error } = await query;
    if (error) { Alert.alert('Could not load products', error.message); }
    else {
      const list = (data ?? []) as Product[];
      setProducts(list);
      if (params.productId && list.some((p) => p.id === params.productId)) {
        setProductId(params.productId);
        setStep('customer');
      }
    }
    setLoading(false);
  }, [params.productId, user?.id]);

  useEffect(() => { void loadProducts(); }, [loadProducts]);

  async function handleSave() {
    const trimName = customerName.trim();
    const trimPhone = phone.trim();
    const trimCnic = cnic.trim();
    const trimAlt = alternatePhone.trim();
    const down = Number(downPayment);
    const count = Number(numberOfInstallments);

    if (!selectedProduct) { Alert.alert('No product', 'Please select a mobile product first.'); return; }
    if (!trimName || trimName.length < 2) { Alert.alert('Invalid Name', 'Please enter customer full name.'); return; }
    if (trimCnic && !isValidCNIC(trimCnic)) { Alert.alert('Invalid CNIC', 'CNIC must be 13 digits (e.g. 35202-1234567-1).'); return; }
    if (!trimPhone) { Alert.alert('Missing Phone', 'Please enter customer mobile number.'); return; }
    if (!isValidPhone(trimPhone)) { Alert.alert('Invalid Phone', 'Please enter a valid mobile number (10 to 11 digits).'); return; }
    if (trimAlt && !isValidPhone(trimAlt)) { Alert.alert('Invalid Alternate Phone', 'Please enter a valid alternate phone number.'); return; }
    if (!Number.isFinite(down) || down < 0) { Alert.alert('Invalid Down Payment', 'Down payment cannot be negative.'); return; }
    if (down >= selectedProduct.price) { Alert.alert('Invalid Down Payment', 'Down payment must be less than total product price.'); return; }
    if (!Number.isInteger(count) || count < 1 || count > 36) { Alert.alert('Invalid Installments', 'Number of installments must be between 1 and 36.'); return; }
    if (!preview) { Alert.alert('Check inputs', 'Enter valid payment details.'); return; }

    // ── Device Limit Check (Cumulative Devices Counter) ───────────────────
    let currentUsed = profile?.used_devices ?? 0;
    if (user?.id) {
      const { count: totalCreated } = await supabase
        .from('installments')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      const { count: logCount } = await supabase
        .from('device_logs')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);

      currentUsed = Math.max(currentUsed, totalCreated ?? 0, logCount ?? 0);
    }

    if (profile && currentUsed >= profile.device_limit) {
      Alert.alert(
        '🚫 Customer Limit Reached',
        `Your plan allows maximum ${profile.device_limit} customer slots (Used: ${currentUsed}/${profile.device_limit}).\n\nNote: All created customers (active, completed, or deleted) remain counted against your quota. Contact administrator to increase your limit.`
      );
      return;
    }
    // ─────────────────────────────────────────────────────────────────────

    setSaving(true);
    const custPayload: Record<string, unknown> = {
      name: trimName,
      phone: trimPhone,
      cnic: cnic.trim() || null,
      alternate_phone: alternatePhone.trim() || null,
      address: address.trim() || null,
      ...(user?.id ? { user_id: user.id } : {}),
    };

    let { data: custData, error: custErr } = await supabase
      .from('customers')
      .insert(custPayload)
      .select('id')
      .single();

    if (custErr) {
      delete custPayload.cnic;
      delete custPayload.alternate_phone;
      const retry = await supabase.from('customers').insert(custPayload).select('id').single();
      custData = retry.data;
      custErr = retry.error;
    }

    if (custErr || !custData) { setSaving(false); Alert.alert('Customer error', custErr?.message); return; }

    const qrRef = `INS-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const { data: instData, error: instErr } = await supabase
      .from('installments')
      .insert({
        customer_id: custData.id,
        product_id: selectedProduct.id,
        product_price: selectedProduct.price,
        down_payment: Number(downPayment) || 0,
        remaining_balance: preview.remaining,
        number_of_installments: Number(numberOfInstallments),
        installment_amount: preview.monthlyAmount,
        qr_code_ref: qrRef,
        status: 'active',
        ...(user?.id ? { user_id: user.id } : {}),
      })
      .select('id')
      .single();

    if (instErr || !instData) { setSaving(false); Alert.alert('Installment error', instErr?.message); return; }

    const payments = preview.amounts.map((amount, idx) => ({
      installment_id: instData.id,
      installment_number: idx + 1,
      amount,
      due_date: preview.dueDates[idx],
      status: 'unpaid',
    }));

    const { error: payErr } = await supabase.from('payments').insert(payments);
    setSaving(false);
    if (payErr) { Alert.alert('Payments error', payErr.message); return; }

    // Permanent log in device_logs + increment used_devices on profile
    if (user?.id) {
      const newUsedCount = currentUsed + 1;
      await supabase
        .from('profiles')
        .update({ used_devices: newUsedCount })
        .eq('id', user.id);

      await supabase.from('device_logs').insert({
        user_id: user.id,
        installment_id: instData.id,
      });
    }

    router.replace(`/installment/${instData.id}`);
  }

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: colors.backgroundSelected },
  ];

  if (loading) {
    return (
      <ThemedView style={styles.root}>
        <SafeAreaView style={styles.safe}>
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>

          {/* ── Header ──────────────────────────────────────── */}
          <View style={styles.header}>
            <ThemedText type="subtitle" style={styles.title}>New Sale</ThemedText>
          </View>

          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled">

            {/* ═══ Customer Info & Mobile Selection ═══ */}
            <View style={styles.section}>
              <ThemedText type="smallBold" style={styles.sectionLabel}>Customer & Mobile Details</ThemedText>

              {/* 1. Customer Name */}
              <TextInput
                value={customerName}
                onChangeText={setCustomerName}
                placeholder="Full Name *"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
              />

              {/* 2. CNIC */}
              <TextInput
                value={cnic}
                onChangeText={(t) => setCnic(formatCNIC(t))}
                placeholder="CNIC Number (e.g. 35202-1234567-1)"
                keyboardType="numeric"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
              />

              {/* 3. Select Mobile Field */}
              <View style={{ gap: 6 }}>
                <Pressable
                  style={[
                    styles.pickerBox,
                    {
                      backgroundColor: colors.backgroundElement,
                      borderColor: selectedProduct ? '#2563EB' : colors.backgroundSelected,
                    },
                  ]}
                  onPress={() => setDropdownOpen((prev) => !prev)}>
                  {selectedProduct ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 }}>
                      <View style={[styles.pickerIconWrap, { backgroundColor: '#EFF6FF' }]}>
                        <Smartphone size={22} color="#2563EB" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontWeight: '700', fontSize: 16, color: colors.text }}>
                          {selectedProduct.name}
                        </Text>
                        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                          {[
                            getProductSpecs(selectedProduct).ram ? `${getProductSpecs(selectedProduct).ram} RAM` : '',
                            getProductSpecs(selectedProduct).storage ? `${getProductSpecs(selectedProduct).storage} Storage` : '',
                          ]
                            .filter(Boolean)
                            .join(' / ') || selectedProduct.description || 'Tap to change mobile'}
                        </Text>
                      </View>
                      <ChevronDown size={20} color={colors.textSecondary} style={{ transform: [{ rotate: dropdownOpen ? '180deg' : '0deg' }] }} />
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Smartphone size={20} color={colors.textSecondary} />
                        <Text style={{ color: colors.textSecondary, fontSize: 15 }}>Select a mobile phone...</Text>
                      </View>
                      <ChevronDown size={20} color={colors.textSecondary} style={{ transform: [{ rotate: dropdownOpen ? '180deg' : '0deg' }] }} />
                    </View>
                  )}
                </Pressable>

                {/* Inline Dropdown Accordion List */}
                {dropdownOpen && (
                  <View style={[styles.inlineDropdownCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                    <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {filteredProducts.length === 0 ? (
                        <View style={{ padding: 16, alignItems: 'center' }}>
                          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>No mobile products found</Text>
                        </View>
                      ) : (
                        filteredProducts.map((p) => {
                          const specs = getProductSpecs(p);
                          const isSelected = p.id === productId;
                          const subText = [specs.ram ? `${specs.ram} RAM` : '', specs.storage ? `${specs.storage} Storage` : '']
                            .filter(Boolean)
                            .join(' / ') || p.description || '';

                          return (
                            <Pressable
                              key={p.id}
                              style={[
                                styles.dropdownItemRow,
                                {
                                  backgroundColor: isSelected ? '#EFF6FF' : 'transparent',
                                },
                              ]}
                              onPress={() => {
                                setProductId(p.id);
                                setDropdownOpen(false);
                              }}>
                              <View style={[styles.dropdownPhoneIcon, { backgroundColor: '#EFF6FF' }]}>
                                <Smartphone size={18} color="#2563EB" />
                              </View>
                              <View style={{ flex: 1, gap: 2 }}>
                                <Text style={{ fontWeight: '700', fontSize: 14, color: colors.text }}>{p.name}</Text>
                                {subText ? (
                                  <Text style={{ fontSize: 11, color: colors.textSecondary }}>{subText}</Text>
                                ) : null}
                              </View>
                              <Text style={{ fontWeight: '700', fontSize: 14, color: '#2563EB' }}>
                                {formatMoney(p.price)}
                              </Text>
                            </Pressable>
                          );
                        })
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Selected Mobile Price Display */}
              {selectedProduct ? (
                <View style={styles.priceHighlightCard}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.priceHighlightLabel}>Mobile Price</Text>
                    <Text style={styles.priceHighlightValue}>{formatMoney(selectedProduct.price)}</Text>
                  </View>
                </View>
              ) : null}

              {/* 4. Phone Number */}
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Mobile Number *"
                keyboardType="phone-pad"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
              />

              {/* 5. Address */}
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="Address (optional)"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
              />
            </View>

            {/* ═══ Payment Plan Fields ═══ */}
            <View style={styles.section}>
              <ThemedText type="smallBold" style={styles.sectionLabel}>Payment Plan</ThemedText>
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <ThemedText type="code" themeColor="textSecondary" style={styles.colLabel}>Down Payment (PKR)</ThemedText>
                  <TextInput
                    value={downPayment}
                    onChangeText={setDownPayment}
                    keyboardType="decimal-pad"
                    placeholderTextColor={colors.textSecondary}
                    style={inputStyle}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText type="code" themeColor="textSecondary" style={styles.colLabel}>No. of Installments</ThemedText>
                  <TextInput
                    value={numberOfInstallments}
                    onChangeText={setNumberOfInstallments}
                    keyboardType="number-pad"
                    placeholderTextColor={colors.textSecondary}
                    style={inputStyle}
                  />
                </View>
              </View>
            </View>

            {/* ═══ Installment Preview ═══ */}
            {preview && selectedProduct && (
              <View style={[styles.preview, { backgroundColor: colors.backgroundElement }]}>
                <ThemedText type="smallBold" style={styles.sectionLabel}>Preview</ThemedText>
                <View style={styles.previewRow}>
                  <ThemedText type="small" themeColor="textSecondary">Total Price</ThemedText>
                  <ThemedText type="smallBold">{formatMoney(selectedProduct.price)}</ThemedText>
                </View>
                <View style={styles.previewRow}>
                  <ThemedText type="small" themeColor="textSecondary">Down Payment</ThemedText>
                  <ThemedText type="smallBold">{formatMoney(Number(downPayment) || 0)}</ThemedText>
                </View>
                <View style={styles.previewRow}>
                  <ThemedText type="small" themeColor="textSecondary">Remaining</ThemedText>
                  <ThemedText type="smallBold">{formatMoney(preview.remaining)}</ThemedText>
                </View>
                <View style={[styles.previewRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.backgroundSelected, paddingTop: Spacing.two }]}>
                  <ThemedText type="small" themeColor="textSecondary">Monthly ({numberOfInstallments}x)</ThemedText>
                  <ThemedText type="smallBold" style={{ color: '#2563EB' }}>
                    {formatMoney(preview.monthlyAmount)}/mo
                  </ThemedText>
                </View>
              </View>
            )}

            {/* Save button */}
            <Pressable
              style={[styles.saveBtn, saving && styles.disabled]}
              disabled={saving}
              onPress={() => void handleSave()}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnLabel}>Create Installment</Text>
              )}
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>


      <TabBar />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  title: { fontSize: 24, fontWeight: '700' },
  steps: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    gap: 0,
  },
  stepItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepDot: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  stepLine: { width: 24, height: 2, marginHorizontal: 4 },
  scroll: { paddingHorizontal: Spacing.three, gap: Spacing.two, paddingBottom: 100 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, paddingHorizontal: Spacing.two, height: 44, gap: 8,
  },
  searchInput: { flex: 1, fontSize: 15 },
  emptyState: { alignItems: 'center', gap: Spacing.two, paddingTop: 40 },
  phoneRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.two, padding: Spacing.two, borderRadius: 14,
  },
  phoneIcon: {
    width: 52, height: 52, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  selectedPhone: {
    flexDirection: 'row', alignItems: 'center',
    gap: Spacing.two, padding: Spacing.three, borderRadius: 14,
  },
  section: { gap: Spacing.two },
  sectionLabel: { marginBottom: 2 },
  colLabel: { marginBottom: 4 },
  twoCol: { flexDirection: 'row', gap: Spacing.two },
  preview: {
    borderRadius: 14, padding: Spacing.three, gap: Spacing.two,
  },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between' },
  input: {
    borderWidth: 1, borderRadius: 10,
    paddingHorizontal: Spacing.three, paddingVertical: 12, fontSize: 15,
  },
  saveBtn: {
    backgroundColor: '#2563EB', borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', paddingVertical: 16,
    marginTop: Spacing.two,
  },
  saveBtnLabel: { color: '#fff', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.5 },

  /* Picker Box & Price Highlight Card */
  pickerBox: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 52,
    justifyContent: 'center',
  },
  pickerIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  changeBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  changeBadgeText: {
    color: '#2563EB',
    fontWeight: '700',
    fontSize: 12,
  },
  priceHighlightCard: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  priceHighlightLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E40AF',
  },
  priceHighlightValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2563EB',
  },

  /* Inline Dropdown Accordion Styles */
  inlineDropdownCard: {
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 6,
    padding: 8,
    overflow: 'hidden',
  },
  inlineSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 38,
    gap: 8,
    marginBottom: 6,
  },
  inlineSearchInput: {
    flex: 1,
    fontSize: 14,
  },
  dropdownItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    marginBottom: 4,
  },
  dropdownPhoneIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
