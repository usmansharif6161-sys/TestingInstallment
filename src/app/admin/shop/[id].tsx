import { Stack, useLocalSearchParams } from 'expo-router';
import {
  Check,
  Copy,
  Key,
  Mail,
  Phone,
  Smartphone,
  Store,
  User,
  Users
} from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import type { UserProfile } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGuardedRouter } from '@/hooks/use-guarded-router';
import { supabase } from '@/lib/supabase';

export default function ShopDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useGuardedRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const isDark = scheme === 'dark';

  const [shop, setShop] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editLimit, setEditLimit] = useState('');
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [activeCount, setActiveCount] = useState(0);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const loadShop = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single();
    let usedCount = (data as UserProfile)?.used_devices ?? 0;

    // Count all created installments & logs for this shop
    const { count } = await supabase
      .from('installments')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', id);

    const { count: logCount } = await supabase
      .from('device_logs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', id);

    const realMax = Math.max(usedCount, count ?? 0, logCount ?? 0);

    if (realMax > usedCount && id) {
      void supabase
        .from('profiles')
        .update({ used_devices: realMax })
        .eq('id', id);
    }

    if (data) {
      setShop({ ...(data as UserProfile), used_devices: realMax });
    }

    setActiveCount(realMax);

    setLoading(false);
  }, [id]);

  useEffect(() => {
    void loadShop();
  }, [loadShop]);

  async function saveLimit() {
    const newLimit = Number(editLimit);
    if (!newLimit || newLimit < 1) {
      Alert.alert('Invalid', 'Please enter a valid device limit.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ device_limit: newLimit })
      .eq('id', id);
    setSaving(false);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setIsEditingLimit(false);
      Alert.alert('Saved', `Device limit updated to ${newLimit}.`);
      await loadShop();
    }
  }

  async function toggleBlock() {
    if (!shop) return;
    const newBlocked = !shop.is_blocked;
    Alert.alert(
      newBlocked ? 'Block Shop?' : 'Unblock Shop?',
      newBlocked
        ? `Are you sure you want to block "${shop.shop_name}"? They won't be able to login.`
        : `Unblock "${shop.shop_name}" so they can use the app again?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: newBlocked ? 'Block' : 'Unblock',
          style: newBlocked ? 'destructive' : 'default',
          onPress: async () => {
            setSaving(true);
            const { error } = await supabase
              .from('profiles')
              .update({ is_blocked: newBlocked })
              .eq('id', id);
            setSaving(false);
            if (error) {
              Alert.alert('Error', error.message);
            } else {
              await loadShop();
            }
          },
        },
      ]
    );
  }

  const copyToClipboard = (text: string, label: string) => {
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
    Alert.alert('Copied!', `${label} copied: ${text}`);
  };

  if (loading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator color="#2563EB" size="large" />
      </ThemedView>
    );
  }

  if (!shop) {
    return (
      <ThemedView style={styles.centered}>
        <ThemedText>Shop not found.</ThemedText>
        <Pressable onPress={() => router.back()}>
          <ThemedText type="linkPrimary">Go Back</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const borderColor = isDark ? '#334155' : '#E2E8F0';
  const statusColor = shop.is_blocked ? '#EF4444' : '#10B981';
  const usagePercent = shop.device_limit > 0 ? Math.min((activeCount / shop.device_limit) * 100, 100) : 0;

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen options={{ title: 'Shop Details', headerBackTitle: '', headerBackTitleVisible: false }} />
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

            {/* Shop Header Card */}
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <View style={styles.shopHeader}>
                <View style={[styles.shopIcon, { backgroundColor: '#EFF6FF' }]}>
                  <Store size={26} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.shopTitle, { color: colors.text }]}>
                    {shop.shop_name || 'Unnamed Shop'}
                  </Text>
                  <View style={{ gap: 6, marginTop: 8 }}>
                    {shop.owner_name ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <User size={14} color="#64748B" />
                        <Text style={styles.shopSub}>{shop.owner_name}</Text>
                      </View>
                    ) : null}
                    {shop.phone ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Phone size={14} color="#64748B" />
                        <Text style={styles.shopSub}>{shop.phone}</Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Right Status Badge & Block Button (HORIZONTAL SIDE-BY-SIDE) */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={[styles.badge, { backgroundColor: shop.is_blocked ? '#FEE2E2' : '#DCFCE7' }]}>
                    <Text style={[styles.badgeText, { color: shop.is_blocked ? '#DC2626' : '#16A34A' }]}>
                      {shop.is_blocked ? 'Blocked' : 'Active'}
                    </Text>
                  </View>
                  <Pressable
                    style={[
                      styles.headerBlockBtn,
                      {
                        backgroundColor: shop.is_blocked ? '#DCFCE7' : '#FEE2E2',
                      },
                      saving && styles.disabled,
                    ]}
                    disabled={saving}
                    onPress={() => void toggleBlock()}>
                    <Text style={[styles.headerBlockBtnText, { color: shop.is_blocked ? '#16A34A' : '#DC2626' }]}>
                      {shop.is_blocked ? 'Unblock' : 'Block'}
                    </Text>
                  </Pressable>
                </View>
              </View>

              {/* Login Credentials Box */}
              {(shop.email || shop.initial_password) && (
                <View style={[styles.credContainer, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor }]}>
                  <View style={styles.credTitleRow}>
                    <Key size={16} color="#2563EB" />
                    <Text style={styles.credHeaderTitle}>Assigned Login Credentials</Text>
                  </View>

                  <View style={[styles.credCardInner, { backgroundColor: isDark ? '#1E293B' : '#EFF6FF', borderColor: '#2563EB20' }]}>
                    {/* Email Row */}
                    {shop.email ? (
                      <View style={styles.credRow}>
                        <View style={styles.credIconBox}>
                          <Mail size={16} color="#2563EB" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.credLabel}>Email</Text>
                          <Text style={[styles.credValue, { color: colors.text }]}>{shop.email}</Text>
                        </View>
                        <Pressable
                          style={styles.copyBtn}
                          onPress={() => copyToClipboard(shop.email!, 'Email')}>
                          {copiedField === 'Email' ? <Check size={16} color="#10B981" /> : <Copy size={16} color="#2563EB" />}
                        </Pressable>
                      </View>
                    ) : null}

                    {shop.email && shop.initial_password ? <View style={styles.credDivider} /> : null}

                    {/* Password Row */}
                    {shop.initial_password ? (
                      <View style={styles.credRow}>
                        <View style={styles.credIconBox}>
                          <Key size={16} color="#2563EB" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.credLabel}>Password</Text>
                          <Text style={[styles.credValue, { color: colors.text }]}>{shop.initial_password}</Text>
                        </View>
                        <Pressable
                          style={styles.copyBtn}
                          onPress={() => copyToClipboard(shop.initial_password!, 'Password')}>
                          {copiedField === 'Password' ? <Check size={16} color="#10B981" /> : <Copy size={16} color="#2563EB" />}
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                </View>
              )}

              {/* Usage Bar */}
              <View style={styles.usageSection}>
                <View style={styles.usageRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Users size={18} color="#2563EB" />
                    <Text style={[styles.usageTitle, { color: colors.text }]}>Devices Used</Text>
                  </View>
                  <Text style={[styles.usageCount, { color: usagePercent > 80 ? '#EF4444' : '#2563EB' }]}>
                    {activeCount} / {shop.device_limit}
                  </Text>
                </View>
                <View style={[styles.progressBar, { backgroundColor: borderColor }]}>
                  <View
                    style={[
                      styles.progressFill,
                      {
                        width: `${usagePercent}%` as any,
                        backgroundColor: usagePercent > 80 ? '#EF4444' : '#2563EB',
                      },
                    ]}
                  />
                </View>
                <Text style={styles.slotsText}>
                  {Math.max(0, shop.device_limit - activeCount)} slots remaining
                </Text>
              </View>
            </View>

            {/* Device Limit Card */}
            <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Smartphone size={20} color="#2563EB" />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Device Limit</Text>
              </View>
              <Text style={styles.cardSub}>
                Cumulative created devices allowed for this shop. All created records (active, completed, or deleted) remain counted.
              </Text>
              <View style={styles.limitRow}>
                <TextInput
                  value={editLimit}
                  onChangeText={setEditLimit}
                  editable={isEditingLimit}
                  keyboardType="numeric"
                  style={[
                    styles.limitInput,
                    {
                      backgroundColor: isEditingLimit
                        ? (isDark ? '#0F172A' : '#FFFFFF')
                        : (isDark ? '#1E293B' : '#F1F5F9'),
                      color: isEditingLimit ? colors.text : colors.textSecondary,
                      borderColor: isEditingLimit ? '#2563EB' : borderColor,
                    },
                  ]}
                />
                {!isEditingLimit ? (
                  <Pressable
                    style={styles.saveBtn}
                    onPress={() => setIsEditingLimit(true)}>
                    <Text style={styles.saveBtnText}>Update</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.saveBtn, saving && styles.disabled]}
                    disabled={saving}
                    onPress={() => void saveLimit()}>
                    {saving ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save</Text>
                    )}
                  </Pressable>
                )}
              </View>
            </View>

            <View style={{ height: 32 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  scroll: { padding: 16, gap: 16 },

  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
  },
  shopHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  shopIcon: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopTitle: { fontSize: 18, fontWeight: '700' },
  shopSub: { fontSize: 13, color: '#64748B' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeText: { fontSize: 14, fontWeight: '700' },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Credentials Box */
  credContainer: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  credTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  credHeaderTitle: { fontSize: 13, fontWeight: '700', color: '#2563EB' },
  credCardInner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  credRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  credIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  credLabel: { fontSize: 11, color: '#64748B', fontWeight: '500' },
  credValue: { fontSize: 14, fontWeight: '700' },
  copyBtn: { padding: 6 },
  credDivider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 2 },

  /* Usage Bar */
  usageSection: { gap: 8 },
  usageRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  usageTitle: { fontSize: 14, fontWeight: '600' },
  usageCount: { fontSize: 15, fontWeight: '700' },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 4 },
  slotsText: { fontSize: 12, color: '#64748B' },

  /* Limit Card */
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardSub: { fontSize: 13, color: '#64748B' },
  limitRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  limitInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '700',
  },
  saveBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingHorizontal: 22,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  quickLimits: { flexDirection: 'row', gap: 8 },
  quickChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 20,
    alignItems: 'center',
  },

  headerBlockBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBlockBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  disabled: { opacity: 0.6 },
});
