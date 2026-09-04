import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TabBar } from '@/components/tab-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGuardedRouter } from '@/hooks/use-guarded-router';
import { formatMoney } from '@/lib/installment';
import { supabase } from '@/lib/supabase';
import type { Customer, InstallmentWithRelations } from '@/lib/types';

export default function CustomersScreen() {
  const router = useGuardedRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const isDark = scheme === 'dark';
  const { user } = useAuth();

  const [customers, setCustomers]   = useState<Customer[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch]         = useState('');

  // Selected customer installments modal
  const [selectedCust, setSelectedCust] = useState<Customer | null>(null);
  const [custInstallments, setCustInstallments] = useState<InstallmentWithRelations[]>([]);
  const [loadingInst, setLoadingInst]   = useState(false);

  const fetchCustomers = useCallback(async () => {
    let query = supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });

    if (user?.id) {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      setCustomers((data ?? []) as Customer[]);
    }
    setLoading(false);
    setRefreshing(false);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      void fetchCustomers();
    }, [fetchCustomers])
  );

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.cnic ?? '').toLowerCase().includes(q) ||
        (c.address ?? '').toLowerCase().includes(q)
    );
  }, [customers, search]);

  async function openCustomerInstallments(cust: Customer) {
    setSelectedCust(cust);
    setLoadingInst(true);
    setCustInstallments([]);

    const { data, error } = await supabase
      .from('installments')
      .select(
        `
        *,
        customers ( * ),
        products ( * ),
        payments ( * )
      `
      )
      .eq('customer_id', cust.id)
      .order('created_at', { ascending: false });

    setLoadingInst(false);
    if (!error && data) {
      setCustInstallments(data as InstallmentWithRelations[]);
    }
  }

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <ThemedText type="subtitle" style={styles.title}>All Customers</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Total {customers.length} registered customer{customers.length === 1 ? '' : 's'}
            </ThemedText>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by Name, CNIC, or Phone..."
            placeholderTextColor={colors.textSecondary}
            style={[
              styles.searchInput,
              {
                backgroundColor: colors.backgroundElement,
                color: colors.text,
                borderColor: colors.backgroundSelected,
              },
            ]}
          />
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#2563EB" />
          </View>
        ) : (
          <FlatList
            data={filteredCustomers}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void fetchCustomers();
                }}
                tintColor="#2563EB"
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={{ fontSize: 44 }}>👥</Text>
                <ThemedText type="smallBold">No Customers Found</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                  {search ? 'Try searching with another name or phone.' : 'Add customers by making a New Sale.'}
                </ThemedText>
              </View>
            }
            renderItem={({ item: c }) => (
              <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
                <View style={styles.cardHeader}>
                  <View style={styles.avatar}>
                    <Text style={{ fontSize: 20 }}>👤</Text>
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <ThemedText type="smallBold" style={{ fontSize: 16 }}>{c.name}</ThemedText>
                    {c.cnic ? (
                      <ThemedText type="code" themeColor="textSecondary">
                        🪪 CNIC: {c.cnic}
                      </ThemedText>
                    ) : null}
                  </View>
                </View>

                <View style={styles.cardDetails}>
                  <View style={styles.detailRow}>
                    <Text style={{ fontSize: 14 }}>📞</Text>
                    <ThemedText type="small">{c.phone}</ThemedText>
                  </View>
                  {c.alternate_phone ? (
                    <View style={styles.detailRow}>
                      <Text style={{ fontSize: 14 }}>📱</Text>
                      <ThemedText type="small" themeColor="textSecondary">Alt: {c.alternate_phone}</ThemedText>
                    </View>
                  ) : null}
                  {c.address ? (
                    <View style={styles.detailRow}>
                      <Text style={{ fontSize: 14 }}>📍</Text>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>{c.address}</ThemedText>
                    </View>
                  ) : null}
                </View>

                <Pressable
                  style={styles.actionBtn}
                  onPress={() => void openCustomerInstallments(c)}>
                  <ThemedText type="smallBold" style={{ color: '#2563EB' }}>
                    View Sales & Installments →
                  </ThemedText>
                </Pressable>
              </View>
            )}
          />
        )}
      </SafeAreaView>

      {/* Customer Installments Modal */}
      <Modal visible={Boolean(selectedCust)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDark ? '#1E293B' : '#FFFFFF' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <ThemedText type="subtitle">{selectedCust?.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {selectedCust?.phone} {selectedCust?.cnic ? `· ${selectedCust.cnic}` : ''}
                </ThemedText>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => setSelectedCust(null)}>
                <Text style={{ fontSize: 18, color: colors.text }}>✕</Text>
              </Pressable>
            </View>

            {loadingInst ? (
              <ActivityIndicator size="large" color="#2563EB" style={{ marginVertical: 32 }} />
            ) : custInstallments.length === 0 ? (
              <View style={styles.emptyModal}>
                <Text style={{ fontSize: 36 }}>📋</Text>
                <ThemedText type="smallBold">No Installments Found</ThemedText>
              </View>
            ) : (
              <FlatList
                data={custInstallments}
                keyExtractor={(item) => item.id}
                contentContainerStyle={{ gap: Spacing.two, paddingVertical: Spacing.two }}
                renderItem={({ item: inst }) => (
                  <Pressable
                    style={[styles.instCard, { backgroundColor: colors.backgroundElement }]}
                    onPress={() => {
                      setSelectedCust(null);
                      router.push(`/installment/${inst.id}`);
                    }}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <ThemedText type="smallBold">{inst.products?.name ?? 'Product'}</ThemedText>
                      <ThemedText type="code" themeColor="textSecondary">
                        Total: {formatMoney(inst.product_price)} · Remaining: {formatMoney(inst.remaining_balance)}
                      </ThemedText>
                    </View>
                    <ThemedText
                      type="smallBold"
                      style={{ color: inst.status === 'completed' ? '#10B981' : '#2563EB' }}>
                      {inst.status === 'completed' ? 'Completed ✓' : 'Active →'}
                    </ThemedText>
                  </Pressable>
                )}
              />
            )}
          </View>
        </View>
      </Modal>

      <TabBar />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 24, fontWeight: '700' },
  searchWrap: {
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.two,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 14,
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.five,
    gap: Spacing.one,
  },
  card: {
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDetails: {
    gap: 4,
    paddingLeft: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionBtn: {
    alignSelf: 'flex-end',
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: Spacing.four,
    maxHeight: '80%',
    minHeight: 300,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyModal: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  instCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 12,
  },
});
