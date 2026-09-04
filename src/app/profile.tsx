import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { ChevronRight, Eye, EyeOff, KeyRound, LogOut, Pencil, QrCode, Search, User, Users } from 'lucide-react-native';

import { TabBar } from '@/components/tab-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGuardedRouter } from '@/hooks/use-guarded-router';
import { supabase } from '@/lib/supabase';
import type { Customer } from '@/lib/types';
import { isValidEmail } from '@/lib/validation';

type ProfileTab = 'menu' | 'profile' | 'password' | 'customers';

export default function ProfileScreen() {
  const router = useGuardedRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const isDark = scheme === 'dark';
  const { user, signOut } = useAuth();

  const [activeTab, setActiveTab] = useState<ProfileTab>('menu');

  // Edit Profile State
  const [shopName, setShopName] = useState(
    (user?.user_metadata?.shop_name as string) ||
    (user?.user_metadata?.full_name as string) ||
    ''
  );
  const [updatingProfile, setUpdatingProfile] = useState(false);

  // Change Password State
  const [oldPassword, setOldPassword]         = useState('');
  const [newPassword, setNewPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld]                 = useState(false);
  const [showNew, setShowNew]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);
  const [updatingPass, setUpdatingPass]       = useState(false);

  // All Customers State
  const [customers, setCustomers]             = useState<Customer[]>([]);
  const [loadingCust, setLoadingCust]         = useState(false);
  const [custSearch, setCustSearch]           = useState('');

  const fetchCustomers = useCallback(async () => {
    setLoadingCust(true);
    let query = supabase
      .from('customers')
      .select('*')
      .order('name', { ascending: true });

    if (user?.id) {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;
    setLoadingCust(false);
    if (!error && data) {
      setCustomers(data as Customer[]);
    }
  }, [user?.id]);

  useEffect(() => {
    if (activeTab === 'customers') {
      void fetchCustomers();
    }
  }, [activeTab, fetchCustomers]);

  const filteredCustomers = customers.filter((c) => {
    const q = custSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      (c.cnic ?? '').toLowerCase().includes(q)
    );
  });

  async function handleUpdateProfile() {
    const trimmed = shopName.trim();
    if (!trimmed) {
      Alert.alert('Shop Name Required', 'Please enter your shop or business name.');
      return;
    }

    setUpdatingProfile(true);
    const { error } = await supabase.auth.updateUser({
      data: { shop_name: trimmed, full_name: trimmed },
    });
    setUpdatingProfile(false);

    if (error) {
      Alert.alert('Profile Update Failed', error.message);
    } else {
      Alert.alert('Profile Updated', 'Your shop profile has been updated successfully!');
      setActiveTab('menu');
    }
  }

  async function handleChangePassword() {
    if (!oldPassword) {
      Alert.alert('Old Password Required', 'Please enter your current password.');
      return;
    }
    if (!newPassword) {
      Alert.alert('New Password Required', 'Please enter a new password.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Weak Password', 'New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Password Mismatch', 'New password and confirm password do not match.');
      return;
    }

    setUpdatingPass(true);

    const userEmail = user?.email ?? '';
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: oldPassword,
    });

    if (signInError) {
      setUpdatingPass(false);
      Alert.alert('Incorrect Old Password', 'Your current password was incorrect.');
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });
    setUpdatingPass(false);

    if (updateError) {
      Alert.alert('Password Change Failed', updateError.message);
    } else {
      Alert.alert('Password Updated', 'Your password has been changed successfully!');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setActiveTab('menu');
    }
  }

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/login');
        },
      },
    ]);
  }

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.backgroundElement,
      color: colors.text,
      borderColor: colors.backgroundSelected,
    },
  ];

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

            {/* Back Button when inside sub-tab */}
            {activeTab !== 'menu' && (
              <Pressable style={styles.backBtn} onPress={() => setActiveTab('menu')}>
                <Text style={{ fontSize: 16, color: '#2563EB', fontWeight: '600' }}>
                  ← Back to Profile
                </Text>
              </Pressable>
            )}

            {/* Header / Avatar */}
            <View style={styles.profileHeader}>
              <View style={styles.avatarWrap}>
                <Image
                  source={require('../../assets/images/DG.png')}
                  style={{ width: 84, height: 84, borderRadius: 22 }}
                  resizeMode="contain"
                />
              </View>
              <ThemedText type="subtitle" style={styles.userName}>
                {shopName || user?.email || 'Shop Owner'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {user?.email}
              </ThemedText>
            </View>

            {/* ═══ VERTICAL MENU (Main View) ═══ */}
            {activeTab === 'menu' && (
              <View style={styles.verticalMenu}>
                <Pressable
                  style={[styles.menuItem, { backgroundColor: colors.backgroundElement }]}
                  onPress={() => setActiveTab('profile')}>
                  <View style={[styles.menuIconWrap, { backgroundColor: '#EFF6FF' }]}>
                    <Pencil size={20} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="smallBold" style={{ fontSize: 16 }}>Edit Profile</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">Change shop name & account details</ThemedText>
                  </View>
                  <ChevronRight size={18} color={colors.textSecondary} />
                </Pressable>

                <Pressable
                  style={[styles.menuItem, { backgroundColor: colors.backgroundElement }]}
                  onPress={() => setActiveTab('password')}>
                  <View style={[styles.menuIconWrap, { backgroundColor: '#EFF6FF' }]}>
                    <KeyRound size={20} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="smallBold" style={{ fontSize: 16 }}>Change Password</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">Update current password</ThemedText>
                  </View>
                  <ChevronRight size={18} color={colors.textSecondary} />
                </Pressable>

                <Pressable
                  style={[styles.menuItem, { backgroundColor: colors.backgroundElement }]}
                  onPress={() => setActiveTab('customers')}>
                  <View style={[styles.menuIconWrap, { backgroundColor: '#EFF6FF' }]}>
                    <Users size={20} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="smallBold" style={{ fontSize: 16 }}>All Customers</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">View all registered customer names</ThemedText>
                  </View>
                  <ChevronRight size={18} color={colors.textSecondary} />
                </Pressable>

                <Pressable
                  style={[styles.menuItem, { backgroundColor: colors.backgroundElement }]}
                  onPress={() => router.push('/scanner')}>
                  <View style={[styles.menuIconWrap, { backgroundColor: '#EFF6FF' }]}>
                    <QrCode size={20} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="smallBold" style={{ fontSize: 16 }}>Device Owner Setup QR</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">Provision customer phone via QR</ThemedText>
                  </View>
                  <ChevronRight size={18} color={colors.textSecondary} />
                </Pressable>

                <Pressable style={styles.signOutBtn} onPress={() => void handleSignOut()}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <LogOut size={18} color="#EF4444" />
                    <Text style={styles.signOutLabel}>Sign Out</Text>
                  </View>
                </Pressable>
              </View>
            )}

            {/* ═══ TAB 1: Edit Profile Screen ═══ */}
            {activeTab === 'profile' && (
              <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Pencil size={20} color="#2563EB" />
                  <ThemedText type="smallBold" style={styles.sectionTitle}>Edit Profile</ThemedText>
                </View>

                <View style={styles.field}>
                  <ThemedText type="code" themeColor="textSecondary">Shop / Business Name</ThemedText>
                  <TextInput
                    value={shopName}
                    onChangeText={setShopName}
                    placeholder="My Mobile Shop"
                    placeholderTextColor={colors.textSecondary}
                    style={inputStyle}
                  />
                </View>

                <View style={styles.field}>
                  <ThemedText type="code" themeColor="textSecondary">Email Address (Read-only)</ThemedText>
                  <TextInput
                    value={user?.email ?? ''}
                    editable={false}
                    style={[inputStyle, { opacity: 0.6 }]}
                  />
                </View>

                <Pressable
                  style={[styles.btnPrimary, updatingProfile && styles.disabled]}
                  disabled={updatingProfile}
                  onPress={() => void handleUpdateProfile()}>
                  {updatingProfile ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnLabel}>Save Profile Changes</Text>
                  )}
                </Pressable>
              </View>
            )}

            {/* ═══ TAB 2: Change Password Screen ═══ */}
            {activeTab === 'password' && (
              <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <KeyRound size={20} color="#2563EB" />
                  <ThemedText type="smallBold" style={styles.sectionTitle}>Change Password</ThemedText>
                </View>

                <View style={styles.field}>
                  <ThemedText type="code" themeColor="textSecondary">Current Password *</ThemedText>
                  <View style={{ position: 'relative' }}>
                    <TextInput
                      value={oldPassword}
                      onChangeText={setOldPassword}
                      placeholder="••••••••"
                      placeholderTextColor={colors.textSecondary}
                      secureTextEntry={!showOld}
                      style={[inputStyle, { paddingRight: 45 }]}
                    />
                    <Pressable style={styles.eyeBtn} onPress={() => setShowOld(!showOld)}>
                      {showOld ? <EyeOff size={18} color={colors.textSecondary} /> : <Eye size={18} color={colors.textSecondary} />}
                    </Pressable>
                  </View>
                </View>

                <View style={styles.field}>
                  <ThemedText type="code" themeColor="textSecondary">New Password *</ThemedText>
                  <View style={{ position: 'relative' }}>
                    <TextInput
                      value={newPassword}
                      onChangeText={setNewPassword}
                      placeholder="••••••••"
                      placeholderTextColor={colors.textSecondary}
                      secureTextEntry={!showNew}
                      style={[inputStyle, { paddingRight: 45 }]}
                    />
                    <Pressable style={styles.eyeBtn} onPress={() => setShowNew(!showNew)}>
                      {showNew ? <EyeOff size={18} color={colors.textSecondary} /> : <Eye size={18} color={colors.textSecondary} />}
                    </Pressable>
                  </View>
                </View>

                <View style={styles.field}>
                  <ThemedText type="code" themeColor="textSecondary">Confirm New Password *</ThemedText>
                  <View style={{ position: 'relative' }}>
                    <TextInput
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      placeholder="••••••••"
                      placeholderTextColor={colors.textSecondary}
                      secureTextEntry={!showConfirm}
                      style={[inputStyle, { paddingRight: 45 }]}
                    />
                    <Pressable style={styles.eyeBtn} onPress={() => setShowConfirm(!showConfirm)}>
                      {showConfirm ? <EyeOff size={18} color={colors.textSecondary} /> : <Eye size={18} color={colors.textSecondary} />}
                    </Pressable>
                  </View>
                </View>

                <Pressable
                  style={[styles.btnPrimary, updatingPass && styles.disabled]}
                  disabled={updatingPass}
                  onPress={() => void handleChangePassword()}>
                  {updatingPass ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnLabel}>Update Password</Text>
                  )}
                </Pressable>
              </View>
            )}

            {/* ═══ TAB 3: All Customers Screen ═══ */}
            {activeTab === 'customers' && (
              <View style={[styles.card, { backgroundColor: colors.backgroundElement }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Users size={20} color="#2563EB" />
                  <ThemedText type="smallBold" style={styles.sectionTitle}>
                    All Registered Customers ({filteredCustomers.length})
                  </ThemedText>
                </View>

                <TextInput
                  value={custSearch}
                  onChangeText={setCustSearch}
                  placeholder="Filter customer name or phone..."
                  placeholderTextColor={colors.textSecondary}
                  style={[inputStyle, { paddingVertical: 10 }]}
                />

                {loadingCust ? (
                  <ActivityIndicator size="large" color="#2563EB" style={{ marginVertical: 20 }} />
                ) : filteredCustomers.length === 0 ? (
                  <View style={styles.emptyCust}>
                    <Users size={36} color={colors.textSecondary} />
                    <ThemedText type="smallBold">No Customers Found</ThemedText>
                  </View>
                ) : (
                  <View style={{ gap: 8 }}>
                    {filteredCustomers.map((c) => (
                      <View key={c.id} style={styles.custRow}>
                        <View style={[styles.custAvatar, { backgroundColor: '#EFF6FF' }]}>
                          <User size={18} color="#2563EB" />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <ThemedText type="smallBold">{c.name}</ThemedText>
                          <ThemedText type="code" themeColor="textSecondary">
                            📞 {c.phone} {c.cnic ? `· CNIC: ${c.cnic}` : ''}
                          </ThemedText>
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

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
  scroll: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.five,
    gap: Spacing.three,
  },
  backBtn: {
    marginBottom: 4,
  },
  profileHeader: {
    alignItems: 'center',
    marginBottom: Spacing.two,
    gap: 4,
  },
  avatarWrap: {
    marginBottom: 4,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
  },
  verticalMenu: {
    gap: Spacing.two,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    borderRadius: 16,
    gap: Spacing.three,
  },
  menuIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    borderRadius: 16,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  field: {
    gap: 4,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 12,
    fontSize: 15,
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  btnPrimary: {
    backgroundColor: '#2563EB',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  btnLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.6,
  },
  custRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.025)',
    gap: 10,
  },
  custAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCust: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 4,
  },
  signOutBtn: {
    backgroundColor: '#EF444415',
    borderWidth: 1,
    borderColor: '#EF4444',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: Spacing.two,
  },
  signOutLabel: {
    color: '#EF4444',
    fontSize: 15,
    fontWeight: '700',
  },
});
