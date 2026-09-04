import { useFocusEffect } from 'expo-router';
import {
  Ban,
  Bell,
  CheckCircle2,
  Edit3,
  LayoutGrid,
  LogOut,
  MoreVertical,
  Pencil,
  Phone,
  Plus,
  Search,
  Smartphone,
  Store,
  Trash2,
  User,
  X
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { useAuth, type UserProfile } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGuardedRouter } from '@/hooks/use-guarded-router';
import { supabase } from '@/lib/supabase';

export default function AdminDashboardScreen() {
  const router = useGuardedRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const isDark = scheme === 'dark';
  const { user, signOut } = useAuth();

  const [shops, setShops] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterActiveOnly, setFilterActiveOnly] = useState<boolean | null>(null);

  // Floating dropdown menu state
  const [menuShop, setMenuShop] = useState<UserProfile | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, right: 0 });
  // Map of per-shop 3-dots button refs for accurate positioning
  const dotBtnRefs = useRef<Record<string, View | null>>({});

  // Edit Modal State (Edit name, phone, device limit - NO email/password editing)
  const [editingShop, setEditingShop] = useState<UserProfile | null>(null);
  const [editShopName, setEditShopName] = useState('');
  const [editOwnerName, setEditOwnerName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDeviceLimit, setEditDeviceLimit] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const [instCountsMap, setInstCountsMap] = useState<Record<string, number>>({});

  const loadShops = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'shop_owner')
      .order('created_at', { ascending: false });

    const { data: instData } = await supabase
      .from('installments')
      .select('user_id');

    const { data: logData } = await supabase
      .from('device_logs')
      .select('user_id');

    const instCounts: Record<string, number> = {};
    if (instData) {
      for (const item of instData) {
        if (item.user_id) {
          instCounts[item.user_id] = (instCounts[item.user_id] || 0) + 1;
        }
      }
    }

    const logCounts: Record<string, number> = {};
    if (logData) {
      for (const item of logData) {
        if (item.user_id) {
          logCounts[item.user_id] = (logCounts[item.user_id] || 0) + 1;
        }
      }
    }

    if (!error && data) {
      const finalShops: UserProfile[] = [];
      for (const shop of data as UserProfile[]) {
        const instCnt = instCounts[shop.id] || 0;
        const logCnt = logCounts[shop.id] || 0;
        const stored = shop.used_devices || 0;
        const realMax = Math.max(stored, instCnt, logCnt);

        if (realMax > stored) {
          // Auto-persist max count to profiles table in Supabase
          void supabase
            .from('profiles')
            .update({ used_devices: realMax })
            .eq('id', shop.id);
          finalShops.push({ ...shop, used_devices: realMax });
        } else {
          finalShops.push({ ...shop, used_devices: realMax });
        }
      }
      setShops(finalShops);
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadShops();
    }, [loadShops])
  );

  useEffect(() => {
    const channel = supabase
      .channel(`admin-shops-${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          void loadShops();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadShops]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadShops();
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to log out of Super Admin?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => void signOut() },
    ]);
  };



  const openEditModal = (shop: UserProfile) => {
    setEditingShop(shop);
    setEditShopName(shop.shop_name || '');
    setEditOwnerName(shop.owner_name || '');
    setEditPhone(shop.phone || '');
    setEditDeviceLimit(String(shop.device_limit || 10));
  };

  const handleSaveEdit = async () => {
    if (!editingShop) return;
    const limitNum = Number(editDeviceLimit);
    if (!limitNum || limitNum < 1) {
      Alert.alert('Invalid Limit', 'Please enter a valid customer limit.');
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase
      .from('profiles')
      .update({
        shop_name: editShopName.trim(),
        owner_name: editOwnerName.trim() || null,
        phone: editPhone.trim() || null,
        device_limit: limitNum,
      })
      .eq('id', editingShop.id);

    setSavingEdit(false);
    if (error) {
      Alert.alert('Error updating shop', error.message);
    } else {
      setEditingShop(null);
      await loadShops();
      Alert.alert('✅ Updated', 'Shop details updated successfully.');
    }
  };

  const handleToggleBlock = async (shop: UserProfile) => {
    const newBlocked = !shop.is_blocked;
    const { error } = await supabase
      .from('profiles')
      .update({ is_blocked: newBlocked })
      .eq('id', shop.id);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      await loadShops();
      Alert.alert(
        newBlocked ? '🚫 Shop Blocked' : '✅ Shop Unblocked',
        `"${shop.shop_name}" has been ${newBlocked ? 'blocked' : 'unblocked'}.`
      );
    }
  };

  const handleDeleteShop = async (shop: UserProfile) => {
    Alert.alert(
      `Delete "${shop.shop_name}"?`,
      'Are you sure you want to permanently delete this shop account? All shop records will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('profiles')
              .delete()
              .eq('id', shop.id);
            if (error) {
              Alert.alert('Error deleting shop', error.message);
            } else {
              await loadShops();
              Alert.alert('Deleted', `Shop "${shop.shop_name}" was deleted.`);
            }
          },
        },
      ]
    );
  };

  // Filtered Shops
  const filteredShops = useMemo(() => {
    return shops.filter((s) => {
      if (filterActiveOnly !== null) {
        if (filterActiveOnly && s.is_blocked) return false;
        if (!filterActiveOnly && !s.is_blocked) return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        s.shop_name?.toLowerCase().includes(q) ||
        s.owner_name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.phone?.toLowerCase().includes(q)
      );
    });
  }, [shops, searchQuery, filterActiveOnly]);

  // Stats
  const totalShops = shops.length;
  const activeShops = shops.filter((s) => !s.is_blocked).length;
  const blockedShops = shops.filter((s) => s.is_blocked).length;
  const totalDeviceSlots = shops.reduce((sum, s) => sum + (s.device_limit || 0), 0);

  const cardBg = isDark ? '#1E293B' : '#FFFFFF';
  const cardBorderColor = isDark ? '#334155' : '#E2E8F0';
  const modalBg = isDark ? '#1E293B' : '#FFFFFF';
  const inputBg = isDark ? '#0F172A' : '#F8FAFC';

  return (
    <View style={styles.root}>
      {/* Top Blue Header */}
      <View style={styles.topHeader}>
        <SafeAreaView edges={['top']}>
          <View style={styles.headerContent}>
            {/* Left Admin Info */}
            <View style={styles.headerLeft}>
              <View style={{ gap: 2 }}>
                <Text style={styles.headerTitle}>Super Admin</Text>
                <Text style={styles.headerSub}>{user?.email ?? 'admin@system.com'}</Text>
              </View>
            </View>

            {/* Right Action Icons */}
            <View style={styles.headerRight}>
              <Pressable style={styles.headerIconBtn} onPress={() => Alert.alert('Notifications', 'No new admin notifications.')}>
                <Bell size={18} color="#FFFFFF" />
              </Pressable>
              <Pressable style={styles.headerIconBtn} onPress={handleSignOut}>
                <LogOut size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </View>

      {/* Main Body Content */}
      <View style={[styles.bodySheet, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC' }]}>
        <ScrollView
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>

          {/* Stats Cards Grid (4 Cards) */}
          <View style={styles.statsGrid}>

            {/* Total Shops */}
            <View style={[styles.statCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
              <View style={[styles.statIconBadge, { backgroundColor: '#EFF6FF' }]}>
                <Store size={18} color="#2563EB" />
              </View>
              <Text style={styles.statNumber}>{totalShops}</Text>
              <Text style={styles.statLabel}>Total Shops</Text>
            </View>

            {/* Active Shops */}
            <View style={[styles.statCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
              <View style={[styles.statIconBadge, { backgroundColor: '#ECFDF5' }]}>
                <CheckCircle2 size={18} color="#10B981" />
              </View>
              <Text style={styles.statNumber}>{activeShops}</Text>
              <Text style={styles.statLabel}>Active Shops</Text>
            </View>

            {/* Blocked */}
            <View style={[styles.statCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
              <View style={[styles.statIconBadge, { backgroundColor: '#FEF2F2' }]}>
                <Ban size={18} color="#EF4444" />
              </View>
              <Text style={styles.statNumber}>{blockedShops}</Text>
              <Text style={styles.statLabel}>Blocked</Text>
            </View>

            {/* Total Device Slots */}
            <View style={[styles.statCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
              <View style={[styles.statIconBadge, { backgroundColor: '#F5F3FF' }]}>
                <LayoutGrid size={18} color="#8B5CF6" />
              </View>
              <Text style={styles.statNumber}>{totalDeviceSlots}</Text>
              <Text style={styles.statLabel}>Total Device Slots</Text>
            </View>

          </View>

          {/* Primary "+ Create New Shop" Button */}
          <Pressable
            style={styles.createShopBtn}
            onPress={() => router.push('/admin/create-shop')}>
            <View style={styles.plusIconWrap}>
              <Plus size={16} color="#1D61F2" strokeWidth={3} />
            </View>
            <Text style={styles.createShopBtnText}>Create New Shop</Text>
          </Pressable>

          {/* Section Header: All Shops + Count Badge */}
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>All Shops</Text>
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>🏪 {filteredShops.length} Shops</Text>
              </View>
            </View>

            {/* Search Bar */}
            <View style={[styles.searchBox, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
              <Search size={18} color="#94A3B8" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search Shop"
                placeholderTextColor="#94A3B8"
                style={[styles.searchInput, { color: colors.text }]}
              />
            </View>
          </View>

          {/* Shops List */}
          {loading ? (
            <ActivityIndicator color="#1D61F2" size="large" style={{ marginTop: 40 }} />
          ) : filteredShops.length === 0 ? (
            <View style={[styles.emptyBox, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>
              <Store size={44} color="#94A3B8" />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No shops found</Text>
              <Text style={styles.emptySub}>
                {searchQuery ? 'No shops matching your search query' : 'Tap "Create New Shop" to add your first shop'}
              </Text>
            </View>
          ) : (
            filteredShops.map((shop) => (
              <View
                key={shop.id}
                style={[styles.shopCard, { backgroundColor: cardBg, borderColor: cardBorderColor }]}>

                {/* Top Shop Info */}
                <View style={styles.shopCardTop}>
                  {/* Shop Store Logo/Icon Box */}
                  <Pressable
                    style={styles.shopLogoBox}
                    onPress={() => router.push(`/admin/shop/${shop.id}`)}>
                    <View style={styles.shopIconInner}>
                      <Store size={24} color="#2563EB" />
                    </View>
                  </Pressable>

                  {/* Details */}
                  <Pressable
                    style={styles.shopMainInfo}
                    onPress={() => router.push(`/admin/shop/${shop.id}`)}>
                    <Text style={[styles.shopName, { color: colors.text }]} numberOfLines={1}>
                      {shop.shop_name || 'Unnamed Shop'}
                    </Text>

                    {shop.owner_name ? (
                      <View style={styles.infoLine}>
                        <User size={13} color="#64748B" />
                        <Text style={styles.infoText}>{shop.owner_name}</Text>
                      </View>
                    ) : null}

                    {shop.phone ? (
                      <View style={styles.infoLine}>
                        <Phone size={13} color="#64748B" />
                        <Text style={styles.infoText}>{shop.phone}</Text>
                      </View>
                    ) : null}

                    {/* Device Limit inline pill */}
                    <View style={styles.deviceLimitPill}>
                      <Smartphone size={13} color="#2563EB" />
                      <Text style={styles.deviceLimitPillText}>
                        Used: {shop.used_devices ?? 0} / {shop.device_limit}
                      </Text>
                    </View>
                  </Pressable>

                  {/* Status Badge + Options (HORIZONTAL SIDE-BY-SIDE) */}
                  <View style={styles.shopRightRow}>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: shop.is_blocked ? '#FEE2E2' : '#DCFCE7',
                        },
                      ]}>
                      <Text
                        style={[
                          styles.statusBadgeText,
                          { color: shop.is_blocked ? '#DC2626' : '#16A34A' },
                        ]}>
                        {shop.is_blocked ? 'Blocked' : 'Active'}
                      </Text>
                    </View>

                    {/* 3-Dots Options Menu Button */}
                    <Pressable
                      ref={(el) => { dotBtnRefs.current[shop.id] = el; }}
                      style={styles.moreBtn}
                      onPress={() => {
                        const btn = dotBtnRefs.current[shop.id];
                        if (btn) {
                          btn.measure((_x, _y, _w, h, px, py) => {
                            setMenuPos({ top: py + h + 6, right: 12 });
                            setMenuShop(shop);
                          });
                        }
                      }}>
                      <MoreVertical size={20} color="#64748B" />
                    </Pressable>
                  </View>
                </View>

              </View>
            ))
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      </View>

      {/* Floating Dropdown Menu */}
      <Modal
        visible={Boolean(menuShop)}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuShop(null)}>
        <Pressable style={styles.dropdownOverlay} onPress={() => setMenuShop(null)}>
          {/* Caret / Arrow pointing up */}
          <View style={[styles.dropdownCaret, { top: menuPos.top - 7, right: menuPos.right + 12 }]} />

          <View style={[styles.dropdownCard, { top: menuPos.top, right: menuPos.right }]}>

            {/* Update Option */}
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.dropdownItem}
              onPress={() => {
                setMenuShop(null);
                if (menuShop) openEditModal(menuShop);
              }}>
              <View style={styles.dropdownIconBadge}>
                <Pencil size={14} color="#2563EB" />
              </View>
              <Text style={[styles.dropdownItemText, { color: '#1E293B' }]}>Update</Text>
            </TouchableOpacity>

            <View style={styles.dropdownDivider} />

            {/* Delete Option */}
            <TouchableOpacity
              activeOpacity={0.75}
              style={styles.dropdownItem}
              onPress={() => {
                const shop = menuShop;
                setMenuShop(null);
                if (shop) void handleDeleteShop(shop);
              }}>
              <View style={[styles.dropdownIconBadge, { backgroundColor: '#FEF2F2' }]}>
                <Trash2 size={14} color="#EF4444" />
              </View>
              <Text style={[styles.dropdownItemText, { color: '#EF4444' }]}>Delete</Text>
            </TouchableOpacity>

          </View>
        </Pressable>
      </Modal>

      {/* Edit Shop Modal (Update name, owner, phone, device limit - NO email/password) */}
      <Modal
        visible={Boolean(editingShop)}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingShop(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: modalBg, borderColor: cardBorderColor }]}>

            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Edit3 size={20} color="#2563EB" />
                <Text style={[styles.modalTitle, { color: colors.text }]}>Update Shop Details</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={() => setEditingShop(null)}>
                <X size={20} color="#64748B" />
              </Pressable>
            </View>

            <Text style={styles.modalSub}>
              Update business details and customer limit for {editingShop?.shop_name}.
            </Text>

            {/* Form Fields */}
            <View style={styles.modalForm}>
              {/* Business Name */}
              <View style={styles.modalField}>
                <Text style={[styles.modalLabel, { color: colors.text }]}>Business Name *</Text>
                <TextInput
                  value={editShopName}
                  onChangeText={setEditShopName}
                  placeholder="Enter business name"
                  placeholderTextColor="#94A3B8"
                  style={[styles.modalInput, { backgroundColor: inputBg, color: colors.text, borderColor: cardBorderColor }]}
                />
              </View>

              {/* Owner Name */}
              <View style={styles.modalField}>
                <Text style={[styles.modalLabel, { color: colors.text }]}>Owner Name</Text>
                <TextInput
                  value={editOwnerName}
                  onChangeText={setEditOwnerName}
                  placeholder="Enter owner name"
                  placeholderTextColor="#94A3B8"
                  style={[styles.modalInput, { backgroundColor: inputBg, color: colors.text, borderColor: cardBorderColor }]}
                />
              </View>

              {/* Phone Number */}
              <View style={styles.modalField}>
                <Text style={[styles.modalLabel, { color: colors.text }]}>Phone Number</Text>
                <TextInput
                  value={editPhone}
                  onChangeText={setEditPhone}
                  placeholder="Enter phone number"
                  placeholderTextColor="#94A3B8"
                  keyboardType="phone-pad"
                  style={[styles.modalInput, { backgroundColor: inputBg, color: colors.text, borderColor: cardBorderColor }]}
                />
              </View>

              {/* Device Limit */}
              <View style={styles.modalField}>
                <Text style={[styles.modalLabel, { color: colors.text }]}>Device Limit (Customers) *</Text>
                <TextInput
                  value={editDeviceLimit}
                  onChangeText={setEditDeviceLimit}
                  placeholder="Enter limit"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numeric"
                  style={[styles.modalInput, { backgroundColor: inputBg, color: colors.text, borderColor: cardBorderColor }]}
                />
              </View>
            </View>

            {/* Modal Actions */}
            <View style={styles.modalActionRow}>
              <Pressable
                style={[styles.modalCancelBtn, { borderColor: cardBorderColor }]}
                onPress={() => setEditingShop(null)}>
                <Text style={[styles.modalCancelText, { color: colors.text }]}>Cancel</Text>
              </Pressable>

              <Pressable
                style={[styles.modalSaveBtn, savingEdit && { opacity: 0.6 }]}
                disabled={savingEdit}
                onPress={() => void handleSaveEdit()}>
                {savingEdit ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>Save Changes</Text>
                )}
              </Pressable>
            </View>

          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0D50E8' },

  /* Top Blue Header */
  topHeader: {
    backgroundColor: '#0D50E8',
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  crownBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
  },
  headerSub: {
    color: 'rgba(255, 255, 255, 0.75)',
    fontSize: 12,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Body Sheet */
  bodySheet: {
    flex: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -12,
    overflow: 'hidden',
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },

  /* Stats Cards Grid */
  statsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 6,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
  },
  statIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    textAlign: 'center',
  },

  /* Create Shop Primary Button */
  createShopBtn: {
    backgroundColor: '#1D61F2',
    borderRadius: 14,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: '#1D61F2',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  plusIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createShopBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  /* Section Header */
  sectionHeader: {
    gap: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
  },
  countBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  countBadgeText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '700',
  },

  /* Search & Filter Row */
  searchRow: {
    flexDirection: 'row',
    gap: 10,
  },
  searchBox: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
  },
  filterBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Empty Box */
  emptyBox: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },

  /* Shop Card */
  shopCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
  },
  shopCardTop: {
    flexDirection: 'row',
    padding: 14,
    gap: 12,
  },
  shopLogoBox: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopIconInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopMainInfo: {
    flex: 1,
    gap: 3,
  },
  shopName: {
    fontSize: 16,
    fontWeight: '700',
  },
  infoLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoText: {
    fontSize: 12,
    color: '#64748B',
  },
  deviceLimitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  deviceLimitPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2563EB',
  },

  /* Right Row: Active Badge & 3-Dots Side-by-Side */
  shopRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 14,
    fontWeight: '700',
  },
  moreBtn: {
    padding: 6,
    borderRadius: 8,
  },

  /* Shop Card Bottom Meta Bar */
  shopCardMeta: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(248, 250, 252, 0.5)',
  },
  metaCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  metaVal: {
    fontSize: 15,
    fontWeight: '700',
  },
  metaLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  colDivider: {
    width: 1,
    height: '70%',
    alignSelf: 'center',
  },

  /* Modal Styling */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  modalSub: {
    fontSize: 13,
    color: '#64748B',
  },
  modalForm: {
    gap: 12,
  },
  modalField: {
    gap: 6,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  presetChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  presetChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  modalCancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalSaveBtn: {
    flex: 1,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },

  /* Floating Dropdown Menu */
  dropdownOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  dropdownCaret: {
    position: 'absolute',
    width: 14,
    height: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderColor: '#E2EAF4',
    transform: [{ rotate: '45deg' }],
    zIndex: 10,
    shadowColor: '#1D4ED8',
    shadowOffset: { width: -1, height: -1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 2,
  },
  dropdownCard: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    minWidth: 125,
    borderWidth: 1,
    borderColor: '#E2EAF4',
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 12,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dropdownIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownItemText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: '#EEF2F9',
  },
});
