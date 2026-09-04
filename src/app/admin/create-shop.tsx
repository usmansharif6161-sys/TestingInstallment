import { useGuardedRouter } from '@/hooks/use-guarded-router';
import { Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { isValidEmail } from '@/lib/validation';

// A separate Supabase client without session persistence
// so admin creating a shop doesn't get logged out of their own session
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// This client does NOT persist sessions — safe for creating other users
const adminSignupClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const LIMIT_PRESETS = [
  { label: 'Starter — 10 customers', value: 10 },
  { label: 'Growth — 20 customers', value: 20 },
  { label: 'Pro — 50 customers', value: 50 },
  { label: 'Unlimited — 500', value: 500 },
];

export default function CreateShopScreen() {
  const router = useGuardedRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const isDark = scheme === 'dark';
  const { user: adminUser } = useAuth();

  const [shopName, setShopName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [deviceLimit, setDeviceLimit] = useState(10);
  const [customLimit, setCustomLimit] = useState('');
  const [saving, setSaving] = useState(false);
  const [createdSuccess, setCreatedSuccess] = useState(false);

  const inputStyle = [
    styles.input,
    {
      backgroundColor: colors.backgroundElement,
      color: colors.text,
      borderColor: colors.backgroundSelected,
    },
  ];

  async function handleCreate() {
    if (!shopName.trim()) {
      Alert.alert('Required', 'Please enter shop name.'); return;
    }
    if (!email.trim() || !isValidEmail(email.trim())) {
      Alert.alert('Required', 'Please enter a valid email address.'); return;
    }
    if (!password || password.length < 6) {
      Alert.alert('Required', 'Password must be at least 6 characters.'); return;
    }

    const finalLimit = customLimit ? Number(customLimit) : deviceLimit;
    if (!finalLimit || finalLimit < 1) {
      Alert.alert('Required', 'Please set a valid customer limit.'); return;
    }

    setSaving(true);

    try {
      // Step 1: Create the Supabase auth user using separate client (won't affect admin session)
      const { data: signUpData, error: signUpError } = await adminSignupClient.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            shop_name: shopName.trim(),
            owner_name: ownerName.trim(),
            role: 'shop_owner',
          },
        },
      });

      if (signUpError || !signUpData.user) {
        Alert.alert('Error', signUpError?.message ?? 'Failed to create user account.');
        setSaving(false);
        return;
      }

      const newUserId = signUpData.user.id;

      // Step 2: Upsert profile with full details (trigger may already create row)
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: newUserId,
          role: 'shop_owner',
          shop_name: shopName.trim(),
          owner_name: ownerName.trim() || null,
          phone: phone.trim() || null,
          email: email.trim().toLowerCase(),
          initial_password: password,
          device_limit: finalLimit,
          subscription_status: 'active',
          is_blocked: false,
          created_by: adminUser?.id ?? null,
        });

      if (profileError) {
        Alert.alert('Warning', `User created but profile update failed: ${profileError.message}`);
      }

      setSaving(false);
      setCreatedSuccess(true);
      setTimeout(() => {
        router.replace('/admin');
      }, 1000);
    } catch (err: any) {
      setSaving(false);
      Alert.alert('Error', err?.message ?? 'Something went wrong. Please try again.');
    }
  }

  const cardBg = isDark ? '#1E293B' : '#F8FAFC';
  const borderColor = isDark ? '#334155' : '#E2E8F0';

  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">


            {/* Shop Name */}
            <View style={styles.field}>
              <ThemedText type="smallBold">Business Name </ThemedText>
              <TextInput
                value={shopName}
                onChangeText={setShopName}
                placeholder="Enter Business Name"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
              />
            </View>

            {/* Owner Name */}
            <View style={styles.field}>
              <ThemedText type="smallBold">Owner Name</ThemedText>
              <TextInput
                value={ownerName}
                onChangeText={setOwnerName}
                placeholder="Enter Owner Name"
                placeholderTextColor={colors.textSecondary}
                style={inputStyle}
              />
            </View>

            {/* Phone */}
            <View style={styles.field}>
              <ThemedText type="smallBold">Phone Number</ThemedText>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Enter phone number"
                placeholderTextColor={colors.textSecondary}
                keyboardType="phone-pad"
                style={inputStyle}
              />
            </View>

            {/* Email */}
            <View style={styles.field}>
              <ThemedText type="smallBold">Email</ThemedText>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="Enter Email"
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                style={inputStyle}
              />
            </View>

            {/* Password */}
            <View style={styles.field}>
              <ThemedText type="smallBold">Password</ThemedText>
              <View style={styles.passwordWrapper}>
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter Password"
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  style={[inputStyle, { flex: 1, paddingRight: 40 }]}
                />
                <Pressable
                  style={styles.eyeBtn}
                  onPress={() => setShowPassword((prev) => !prev)}>
                  {showPassword ? (
                    <EyeOff size={20} color={colors.textSecondary} />
                  ) : (
                    <Eye size={20} color={colors.textSecondary} />
                  )}
                </Pressable>
              </View>

            </View>

            {/* Customer Limit */}
            <View style={styles.field}>
              <ThemedText type="smallBold">Device Limit</ThemedText>

              <TextInput
                value={customLimit}
                onChangeText={setCustomLimit}
                placeholder="Enter Device Limit (e.g. 10)"
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                style={inputStyle}
              />
            </View>


            {/* Create Button */}
            <Pressable
              style={[styles.createBtn, saving && styles.disabled]}
              disabled={saving}
              onPress={() => void handleCreate()}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.createBtnText}> Create Shop </Text>
              )}
            </Pressable>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal visible={createdSuccess} transparent animationType="fade">
        <View style={styles.successToastOverlay}>
          <View style={styles.successToastCard}>
            <Text style={styles.successToastText}>Shop created successfully</Text>
          </View>
        </View>
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: { padding: Spacing.four, gap: Spacing.three, paddingBottom: 40 },

  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
  },

  field: { gap: 6 },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    fontSize: 15,
  },

  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 4,
  },
  presetCard: {
    width: '47%',
    borderWidth: 1.5,
    borderRadius: 12,
    padding: Spacing.two,
    alignItems: 'center',
    gap: 2,
  },
  presetNum: { fontSize: 24, fontWeight: '800' },
  presetLabel: { fontSize: 11, fontWeight: '600' },

  customLimitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  customLimitInput: {
    flex: 1,
    fontSize: 15,
    borderBottomWidth: 1,
    paddingVertical: 4,
  },

  summary: {
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    gap: 4,
  },

  createBtn: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 4,
  },
  createBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.6 },
  passwordWrapper: {
    position: 'relative',
    justifyContent: 'center',
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    padding: 6,
  },
  successToastOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successToastCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 20,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  successToastIcon: {
    fontSize: 32,
  },
  successToastText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
});
