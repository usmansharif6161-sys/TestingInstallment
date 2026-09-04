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

import { Eye, EyeOff } from 'lucide-react-native';

import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useGuardedRouter } from '@/hooks/use-guarded-router';
import { formatSupabaseError, supabase } from '@/lib/supabase';
import { isValidEmail } from '@/lib/validation';

export default function LoginScreen() {
  const router = useGuardedRouter();
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const isDark = scheme === 'dark';
  const { signInWithEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function handleLogin() {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      Alert.alert('Email Required', 'Please enter your email address.');
      return;
    }
    if (!isValidEmail(trimmedEmail)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address (e.g. shop@owner.com).');
      return;
    }
    if (!password) {
      Alert.alert('Password Required', 'Please enter your password.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Invalid Password', 'Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    const { error } = await signInWithEmail(trimmedEmail, password);

    if (error) {
      setLoading(false);
      Alert.alert('Login Failed', formatSupabaseError(error));
      return;
    }

    try {
      const { data: { user: loggedInUser } } = await supabase.auth.getUser();
      if (loggedInUser) {
        const { data: prof, error: profError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', loggedInUser.id)
          .single();

        setLoading(false);
        // if (prof?.role === 'super_admin') {
        //   router.replace('/admin');
        // } else {
        //   router.replace('/');
        // }
        // return;
      }
    } catch {
      setLoading(false);
    }

    setLoading(false);
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

            {/* Logo / Header */}
            <View style={styles.logoSection}>
              <View style={styles.iconWrap}>
                <Image
                  source={require('../../assets/images/DG.png')}
                  style={{ width: 90, height: 90, borderRadius: 20 }}
                  resizeMode="contain"
                />
              </View>
              <ThemedText type="subtitle" style={styles.title}>Device Guard</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                Sign in to manage installments & products
              </ThemedText>
            </View>

            {/* Form */}
            <View style={styles.form}>

              {/* Email */}
              <View style={styles.field}>
                <ThemedText type="smallBold">Email Address</ThemedText>
                <TextInput
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter the email address"
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
                <View style={{ position: 'relative' }}>
                  <TextInput
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Enter the password"
                    placeholderTextColor={colors.textSecondary}
                    secureTextEntry={!showPass}
                    autoCapitalize="none"
                    style={[inputStyle, { paddingRight: 45 }]}
                  />
                  <Pressable
                    style={styles.eyeBtn}
                    onPress={() => setShowPass(!showPass)}>
                    {showPass ? (
                      <EyeOff size={20} color={colors.textSecondary} />
                    ) : (
                      <Eye size={20} color={colors.textSecondary} />
                    )}
                  </Pressable>
                </View>
                <Pressable
                  style={{ alignSelf: 'flex-end', marginTop: 4 }}
                  onPress={() => router.push('/forgot-password')}>
                  <Text style={styles.forgotLink}>Forgot Password?</Text>
                </Pressable>
              </View>

              {/* Login Button */}
              <Pressable
                style={[styles.btn, loading && styles.disabled]}
                disabled={loading}
                onPress={() => void handleLogin()}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnLabel}>Sign In</Text>
                )}
              </Pressable>

            </View>

            <View style={styles.footer}>
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                Contact admin to get your login credentials.
              </ThemedText>
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  scroll: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
    justifyContent: 'center',
    flexGrow: 1,
    gap: Spacing.four,
  },
  logoSection: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  title: { fontSize: 26, fontWeight: '700' },
  form: { gap: Spacing.three },
  field: { gap: Spacing.one },
  passRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  forgotLink: { color: '#2563EB', fontSize: 13, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: Spacing.three,
    paddingVertical: 14,
    fontSize: 15,
  },
  eyeBtn: {
    position: 'absolute',
    right: 12,
    top: 14,
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
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signUpLink: { color: '#2563EB', fontSize: 14, fontWeight: '700' },
});
