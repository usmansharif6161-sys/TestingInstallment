import { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGuardedRouter } from '@/hooks/use-guarded-router';
import { formatSupabaseError, supabase } from '@/lib/supabase';
import { isValidEmail } from '@/lib/validation';

export default function ForgotPasswordScreen() {
  const router = useGuardedRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const isDark = scheme === 'dark';
  const { resetPassword } = useAuth();

  const [email, setEmail]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);

  async function handleReset() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Email Required', 'Please enter your email address.');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address (e.g. shop@owner.com).');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: 'testinginstallment://reset-password',
    });
    setLoading(false);

    if (error) {
      Alert.alert('Error', formatSupabaseError(error));
    } else {
      setSent(true);
    }
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
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

            {/* Top Back Button */}
            <Pressable style={styles.backBtn} onPress={() => router.back()}>
              <Text style={{ fontSize: 18, color: colors.text }}>← Back</Text>
            </Pressable>

            {/* Header */}
            <View style={styles.logoSection}>
              <View style={styles.iconWrap}>
                <Image
                  source={require('../../assets/images/shop owner.png')}
                  style={{ width: 80, height: 80, borderRadius: 20 }}
                  resizeMode="contain"
                />
              </View>
              <ThemedText type="subtitle" style={styles.title}>Forgot Password</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                Enter your email address and we'll send you instructions to reset your password.
              </ThemedText>
            </View>

            {sent ? (
              <View style={[styles.successCard, { backgroundColor: isDark ? '#064E3B' : '#ECFDF5' }]}>
                <Text style={{ fontSize: 36, textAlign: 'center' }}>📬</Text>
                <ThemedText type="smallBold" style={{ textAlign: 'center', color: '#10B981', fontSize: 16 }}>
                  Reset Link Sent!
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                  Check your email inbox for instructions to reset your password.
                </ThemedText>
                <Pressable style={styles.btn} onPress={() => router.replace('/login')}>
                  <Text style={styles.btnLabel}>Back to Sign In</Text>
                </Pressable>
              </View>
            ) : (
              /* Form */
              <View style={styles.form}>
                <View style={styles.field}>
                  <ThemedText type="smallBold">Email Address</ThemedText>
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    placeholder="shop@owner.com"
                    placeholderTextColor={colors.textSecondary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={inputStyle}
                  />
                </View>

                <Pressable
                  style={[styles.btn, loading && styles.disabled]}
                  disabled={loading}
                  onPress={() => void handleReset()}>
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.btnLabel}>Send Reset Link</Text>
                  )}
                </Pressable>
              </View>
            )}

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1 },
  safe:   { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.five,
    justifyContent: 'center',
    flexGrow: 1,
    gap: Spacing.four,
  },
  backBtn: { alignSelf: 'flex-start', paddingVertical: 8 },
  logoSection: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  title: { fontSize: 24, fontWeight: '700' },
  form:  { gap: Spacing.three },
  field: { gap: Spacing.one },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    fontSize: 15,
  },
  btn: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginTop: Spacing.two,
  },
  btnLabel: { color: '#fff', fontSize: 16, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  successCard: {
    borderRadius: 16,
    padding: Spacing.four,
    gap: Spacing.two,
    alignItems: 'center',
  },
});
