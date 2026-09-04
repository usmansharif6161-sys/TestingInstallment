import { Calendar, CheckCircle2, MoreVertical, PackageSearch, Pencil, Smartphone, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabBar } from '@/components/tab-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGuardedRouter } from '@/hooks/use-guarded-router';
import { formatMoney, resolvePaymentDisplayStatus } from '@/lib/installment';
import { supabase } from '@/lib/supabase';
import type { InstallmentWithRelations, Payment } from '@/lib/types';
import { formatCNIC } from '@/lib/validation';

function formatProductName(name?: string | null): string {
  if (!name) return 'Mobile Phone';
  const words = name.trim().split(/\s+/);
  const uniqueWords: string[] = [];
  for (const w of words) {
    if (uniqueWords.length === 0 || uniqueWords[uniqueWords.length - 1].toLowerCase() !== w.toLowerCase()) {
      uniqueWords.push(w);
    }
  }
  return uniqueWords.join(' ');
}

type DashboardRow = {
  installment: InstallmentWithRelations;
  nextPayment: Payment | null;
  paidCount: number;
  unpaidCount: number;
  overdueCount: number;
};

export default function DashboardScreen() {
  const router = useGuardedRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const isDark = scheme === 'dark';
  const { user, profile, isAdmin, signOut } = useAuth();

  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Customer Edit Modal State
  const [editingCustomer, setEditingCustomer] = useState<{
    id: string;
    name: string;
    phone: string;
    cnic: string;
    address: string;
  } | null>(null);
  const [editCustName, setEditCustName] = useState('');
  const [editCustPhone, setEditCustPhone] = useState('');
  const [editCustCnic, setEditCustCnic] = useState('');
  const [editCustAddress, setEditCustAddress] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);

  // 3-Dot Floating Menu State
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 16 });
  const [selectedRow, setSelectedRow] = useState<DashboardRow | null>(null);

  async function handleDeleteInstallment(installmentId: string) {
    Alert.alert(
      'Delete Sale Record',
      'Are you sure you want to delete this installment sale record? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            await supabase.from('payments').delete().eq('installment_id', installmentId);
            const { error: delErr } = await supabase.from('installments').delete().eq('id', installmentId);
            if (delErr) {
              Alert.alert('Could not delete', delErr.message);
              setLoading(false);
            } else {
              void loadDashboard();
            }
          },
        },
      ]
    );
  }

  const loadDashboard = useCallback(async () => {
    setError(null);
    let query = supabase
      .from('installments')
      .select(`*, customers(id,name,phone,address,cnic), products(id,name,price), payments(*)`)
      .order('created_at', { ascending: false });

    if (user?.id) {
      query = query.eq('user_id', user.id);
    }

    let { data, error: fetchError } = await query;

    if (fetchError) {
      // Fallback if cnic column is missing in remote database schema
      let retryQuery = supabase
        .from('installments')
        .select(`*, customers(id,name,phone,address), products(id,name,price), payments(*)`)
        .order('created_at', { ascending: false });

      if (user?.id) {
        retryQuery = retryQuery.eq('user_id', user.id);
      }

      const retry = await retryQuery;
      data = retry.data;
      if (retry.error) {
        setError(retry.error.message);
        setRows([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }
    }

    const mapped = ((data ?? []) as InstallmentWithRelations[]).map((inst) => {
      const payments = [...(inst.payments ?? [])].sort(
        (a, b) => a.installment_number - b.installment_number
      );
      const display = payments.map((p) => ({
        ...p,
        // Preserve pending_approval — do NOT overwrite with resolvePaymentDisplayStatus
        status: p.status === 'pending_approval'
          ? 'pending_approval'
          : resolvePaymentDisplayStatus(p.status, p.due_date),
      }));
      const next = display.find((p) => p.status !== 'paid') ?? null;
      return {
        installment: { ...inst, payments: display },
        nextPayment: next,
        paidCount: display.filter((p) => p.status === 'paid').length,
        unpaidCount: display.filter((p) => p.status === 'unpaid').length,
        overdueCount: display.filter((p) => p.status === 'overdue').length,
      };
    });

    setRows(mapped);
    setLoading(false);
    setRefreshing(false);
  }, []);

  async function handleSaveCustomer() {
    if (!editingCustomer) return;
    const name = editCustName.trim();
    const phone = editCustPhone.trim();
    const cnic = editCustCnic.trim();
    const address = editCustAddress.trim();

    if (!name || name.length < 2) {
      Alert.alert('Invalid Name', 'Please enter customer full name.');
      return;
    }
    if (!phone) {
      Alert.alert('Missing Phone', 'Please enter customer phone number.');
      return;
    }

    setSavingCustomer(true);
    const updatePayload: Record<string, unknown> = {
      name,
      phone,
      cnic: cnic || null,
      address: address || null,
    };

    let { error: updateErr } = await supabase
      .from('customers')
      .update(updatePayload)
      .eq('id', editingCustomer.id);

    if (updateErr) {
      delete updatePayload.cnic;
      const retry = await supabase
        .from('customers')
        .update(updatePayload)
        .eq('id', editingCustomer.id);
      updateErr = retry.error;
    }

    setSavingCustomer(false);

    if (updateErr) {
      Alert.alert('Could not update customer', updateErr.message);
    } else {
      setEditingCustomer(null);
      void loadDashboard();
    }
  }

  useEffect(() => {
    void loadDashboard();
    const ch = supabase
      .channel(`dash-${Date.now()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => void loadDashboard())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'installments' }, () => void loadDashboard())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [loadDashboard]);

  // ── Stats ────────────────────────────────────────────────────────
  const totalCount = rows.length;
  const activeCount = rows.filter((r) => r.installment.status === 'active').length;
  const overdueCount = rows.filter((r) => r.overdueCount > 0).length;
  const completedCount = rows.filter((r) => r.installment.status === 'completed').length;

  const statsBg = isDark ? '#0F172A' : '#F8FAFC';
  const cardBg = colors.backgroundElement;

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>

        {/* ── Super Admin Banner Shortcut ──────────────────── */}
        {(isAdmin || profile?.role === 'super_admin') && (
          <Pressable
            style={{
              backgroundColor: '#2563EB',
              paddingVertical: 10,
              paddingHorizontal: Spacing.three,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
            onPress={() => router.push('/admin')}>
            <ThemedText type="smallBold" style={{ color: '#FFFFFF' }}>
              👑 Super Admin Account Active
            </ThemedText>
            <ThemedText type="smallBold" style={{ color: '#FFFFFF', textDecorationLine: 'underline' }}>
              Open Admin Dashboard →
            </ThemedText>
          </Pressable>
        )}

        {/* ── Header ─────────────────────────────────────────── */}
        <View style={styles.header}>
          <View>
            <ThemedText type="subtitle" style={styles.headerTitle}>Dashboard</ThemedText>
            {user?.email ? (
              <ThemedText type="code" themeColor="textSecondary">
                {user.email}
              </ThemedText>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', gap: Spacing.two, alignItems: 'center' }}>
            <Pressable
              style={styles.newSaleBtn}
              onPress={() => router.push('/new-sale')}>
              <ThemedText type="smallBold" style={styles.newSaleBtnLabel}>
                + New Sale
              </ThemedText>
            </Pressable>
          </View>
        </View>

        {/* ── Stats Row ──────────────────────────────────────── */}
        <View style={[styles.statsRow, { backgroundColor: statsBg }]}>
          <StatCard label="Total" value={totalCount} color="#6366F1" />
          <StatCard label="Active" value={activeCount} color="#10B981" />
          <StatCard label="Overdue" value={overdueCount} color="#EF4444" />
          <StatCard label="Completed" value={completedCount} color="#3B82F6" />
        </View>

        {/* ── Pending Approvals Banner Alerts ────────────────── */}
        {rows.filter(r => r.installment.payments.some(p => p.status === 'pending_approval')).map((req) => (
          <Pressable
            key={req.installment.id}
            style={{
              backgroundColor: '#FEF3C7',
              borderColor: '#D97706',
              borderWidth: 1,
              borderRadius: 12,
              padding: Spacing.three,
              marginHorizontal: Spacing.three,
              marginBottom: Spacing.two,
              flexDirection: 'row',
              alignItems: 'center',
              gap: Spacing.two,
            }}
            onPress={() => router.push(`/installment/${req.installment.id}`)}>
            <ThemedText style={{ fontSize: 20 }}>⏳</ThemedText>
            <View style={{ flex: 1 }}>
              <ThemedText type="smallBold" style={{ color: '#B45309' }}>
                Payment Request Pending Approval
              </ThemedText>
              <ThemedText type="small" style={{ color: '#B45309', fontSize: 12 }}>
                {req.installment.customers?.name ?? 'Customer'} has requested approval.
              </ThemedText>
            </View>
            <ThemedText type="smallBold" style={{ color: '#B45309' }}>
              Review ➔
            </ThemedText>
          </Pressable>
        ))}

        {/* ── List ───────────────────────────────────────────── */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <ThemedText type="small" style={{ color: '#EF4444' }}>{error}</ThemedText>
            <Pressable onPress={() => void loadDashboard()} style={styles.retryBtn}>
              <ThemedText type="smallBold" style={{ color: '#fff' }}>Retry</ThemedText>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={rows}
            keyExtractor={(r) => r.installment.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => { setRefreshing(true); void loadDashboard(); }}
                tintColor="#2563EB"
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <View style={styles.emptyIconWrap}>
                  <PackageSearch size={48} color="#2563EB" strokeWidth={1.5} />
                </View>
                <ThemedText type="smallBold" style={styles.emptyTitle}>No installments yet</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center', lineHeight: 20 }}>
                  Create your first sale from the New Sale tab{`\n`}to get started.
                </ThemedText>
                <Pressable style={styles.emptyBtn} onPress={() => router.push('/new-sale')}>
                  <Text style={styles.emptyBtnText}>+ Create Your First Sale</Text>
                </Pressable>
              </View>
            }
            renderItem={({ item: r }) => {
              const isLocked = Boolean(r.installment.is_locked);
              const isCompleted = r.installment.status === 'completed';
              const hasOverdue = r.overdueCount > 0;

              return (
                <Pressable
                  style={[styles.card, { backgroundColor: cardBg, borderColor: isDark ? '#1E293B' : '#E5E7EB' }]}
                  onPress={() => router.push(`/installment/${r.installment.id}`)}>

                  {/* Top row */}
                  <View style={styles.cardTop}>
                    <View style={styles.cardAvatarWrap}>
                      <View style={[styles.avatar, { backgroundColor: isCompleted ? '#DCFCE7' : '#EFF6FF' }]}>
                        {isCompleted ? (
                          <CheckCircle2 size={22} color="#10B981" />
                        ) : (
                          <Smartphone size={22} color="#2563EB" />
                        )}
                      </View>
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={[styles.custName, { color: colors.text }]} numberOfLines={1}>
                        {r.installment.customers?.name ?? 'Customer'}
                      </Text>
                      <Text style={[styles.prodName, { color: colors.textSecondary }]} numberOfLines={1}>
                        {formatProductName(r.installment.products?.name)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                      <StatusBadge
                        label={isCompleted ? 'Done' : isLocked ? 'Locked' : 'Active'}
                        color={isCompleted ? '#10B981' : isLocked ? '#EF4444' : '#2563EB'}
                      />

                      {/* 3-Dot Options Button */}
                      <Pressable
                        hitSlop={12}
                        style={{ padding: 2 }}
                        onPress={(e) => {
                          e.stopPropagation();
                          const nativeEvent = e.nativeEvent;
                          if (nativeEvent && nativeEvent.pageY) {
                            setMenuPos({ top: nativeEvent.pageY + 10, right: 16 });
                          }
                          setSelectedRow(r);
                          setMenuVisible(true);
                        }}>
                        <MoreVertical size={20} color={colors.textSecondary} />
                      </Pressable>
                    </View>
                  </View>

                  {/* Amount row */}
                  <View style={styles.cardAmounts}>
                    <View style={styles.amtBox}>
                      <Text style={[styles.amtLabel, { color: colors.textSecondary }]}>Remaining</Text>
                      <Text style={[styles.amtVal, { color: colors.text }]}>
                        {formatMoney(r.installment.remaining_balance)}
                      </Text>
                    </View>
                    <View style={styles.amtBox}>
                      <Text style={[styles.amtLabel, { color: colors.textSecondary }]}>Paid</Text>
                      <Text style={[styles.amtVal, { color: colors.text }]}>
                        {r.paidCount} / {r.paidCount + r.unpaidCount + r.overdueCount}
                      </Text>
                    </View>
                    {hasOverdue && (
                      <View style={styles.amtBox}>
                        <Text style={[styles.amtLabel, { color: '#EF4444' }]}>Overdue</Text>
                        <Text style={[styles.amtVal, { color: '#EF4444' }]}>
                          {r.overdueCount}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Installment payment row */}
                  {r.nextPayment ? (
                    <View style={[styles.nextRow, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderTopColor: isDark ? '#1F2937' : '#F1F5F9' }]}>
                      <Calendar size={14} color="#2563EB" />
                      <Text style={[styles.nextText, { color: colors.textSecondary }]}>
                        Installment #{r.nextPayment.installment_number} · <Text style={{ fontWeight: '700', color: colors.text }}>{formatMoney(r.nextPayment.amount)}</Text> · due {r.nextPayment.due_date}
                      </Text>
                    </View>
                  ) : isCompleted ? null : (
                    <View style={[styles.nextRow, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderTopColor: isDark ? '#1F2937' : '#F1F5F9' }]}>
                      <CheckCircle2 size={14} color="#10B981" />
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#10B981' }}>All payments complete ✓</Text>
                    </View>
                  )}
                </Pressable>
              );
            }}
          />
        )}
      </SafeAreaView>

      {/* ── Edit Customer Modal ────────────────────────── */}
      <Modal
        visible={editingCustomer !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditingCustomer(null)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)', padding: 20 }}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
            <View style={styles.modalHeaderRow}>
              <Text style={[styles.modalHeaderTitle, { color: colors.text }]}>Edit Customer Details</Text>
              <Pressable onPress={() => setEditingCustomer(null)} hitSlop={10}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <View style={{ gap: 12, marginVertical: 16 }}>
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>Full Name</Text>
                <TextInput
                  value={editCustName}
                  onChangeText={setEditCustName}
                  placeholder="Full Name *"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.modalInput, { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: colors.backgroundSelected }]}
                />
              </View>

              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>CNIC Number</Text>
                <TextInput
                  value={editCustCnic}
                  onChangeText={(t) => setEditCustCnic(formatCNIC(t))}
                  placeholder="e.g. 35202-1234567-1"
                  keyboardType="numeric"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.modalInput, { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: colors.backgroundSelected }]}
                />
              </View>

              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>Mobile Number</Text>
                <TextInput
                  value={editCustPhone}
                  onChangeText={setEditCustPhone}
                  placeholder="Mobile Number"
                  keyboardType="phone-pad"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.modalInput, { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: colors.backgroundSelected }]}
                />
              </View>

              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: colors.textSecondary }}>Address</Text>
                <TextInput
                  value={editCustAddress}
                  onChangeText={setEditCustAddress}
                  placeholder="Address (optional)"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.modalInput, { backgroundColor: colors.backgroundElement, color: colors.text, borderColor: colors.backgroundSelected }]}
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}
                onPress={() => setEditingCustomer(null)}>
                <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalBtn, { backgroundColor: '#2563EB', opacity: savingCustomer ? 0.7 : 1 }]}
                disabled={savingCustomer}
                onPress={() => void handleSaveCustomer()}>
                {savingCustomer ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>Save Changes</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Floating 3-Dot Options Menu Modal ─────────────── */}
      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuVisible(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuVisible(false)}>
          <View
            style={[
              styles.floatingMenu,
              {
                top: Math.min(menuPos.top, 500),
                right: menuPos.right,
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                borderColor: isDark ? '#334155' : '#E2E8F0',
              },
            ]}>
            {/* Edit Option */}
            <Pressable
              style={styles.menuOption}
              onPress={() => {
                setMenuVisible(false);
                if (selectedRow?.installment.customers) {
                  const c = selectedRow.installment.customers;
                  setEditingCustomer({
                    id: c.id,
                    name: c.name || '',
                    phone: c.phone || '',
                    cnic: c.cnic || '',
                    address: c.address || '',
                  });
                  setEditCustName(c.name || '');
                  setEditCustPhone(c.phone || '');
                  setEditCustCnic(c.cnic || '');
                  setEditCustAddress(c.address || '');
                }
              }}>
              <Pencil size={16} color="#2563EB" />
              <Text style={[styles.menuOptionText, { color: colors.text }]}>Edit</Text>
            </Pressable>

            <View style={[styles.menuDivider, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]} />

            {/* Delete Option */}
            <Pressable
              style={styles.menuOption}
              onPress={() => {
                setMenuVisible(false);
                if (selectedRow) {
                  void handleDeleteInstallment(selectedRow.installment.id);
                }
              }}>
              <Trash2 size={16} color="#EF4444" />
              <Text style={[styles.menuOptionText, { color: '#EF4444' }]}>Delete</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <TabBar />
    </ThemedView>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  return (
    <View
      style={[
        statStyles.card,
        {
          backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
          borderColor: isDark ? '#334155' : '#E2E8F0',
        },
      ]}>
      <Text style={{ fontSize: 20, fontWeight: '800', color, marginBottom: 2 }}>{value}</Text>
      <Text
        numberOfLines={1}
        style={{
          fontSize: 11,
          fontWeight: '600',
          color: isDark ? '#94A3B8' : '#64748B',
        }}>
        {label}
      </Text>
    </View>
  );
}

function StatusBadge({ label, color }: { label: string; color: string }) {
  return (
    <View style={[badgeStyles.wrap, { backgroundColor: color + '15' }]}>
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.three,
  },
  headerTitle: { fontSize: 26, fontWeight: '700' },
  newSaleBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
  },
  newSaleBtnLabel: { color: '#fff' },
  logoutBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: 20,
    paddingHorizontal: Spacing.two + 4,
    paddingVertical: 8,
  },
  logoutBtnLabel: { color: '#EF4444', fontSize: 13 },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginBottom: Spacing.two,
  },
  list: { gap: Spacing.two, paddingHorizontal: Spacing.three, paddingBottom: Spacing.five },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: Spacing.three,
  },
  cardAvatarWrap: {},
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardInfo: { flex: 1, gap: 2 },
  custName: {
    fontSize: 16,
    fontWeight: '700',
  },
  prodName: {
    fontSize: 13,
  },
  cardAmounts: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
    gap: 24,
  },
  amtBox: {
    gap: 2,
  },
  amtLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  amtVal: {
    fontSize: 15,
    fontWeight: '700',
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: 10,
  },
  nextText: {
    fontSize: 13,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.two },
  retryBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    marginTop: Spacing.two,
  },
  empty: { alignItems: 'center', gap: Spacing.two, paddingTop: 60, paddingBottom: 40 },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
  },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: '#2563EB',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 13,
  },
  emptyBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  modalCard: {
    width: '100%',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalHeaderTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  modalBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBackdrop: {
    flex: 1,
  },
  floatingMenu: {
    position: 'absolute',
    width: 115,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  menuOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  menuOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  menuDivider: {
    height: 1,
    marginVertical: 2,
  },
});

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
});

const badgeStyles = StyleSheet.create({
  wrap: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
});
