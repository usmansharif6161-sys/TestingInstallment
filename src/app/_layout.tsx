import { Redirect, Stack, usePathname } from 'expo-router';
import { ActivityIndicator, useColorScheme, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/context/auth-context';

// SplashScreen.preventAutoHideAsync();

const AUTH_ROUTES = ['/login', '/signup', '/forgot-password'];

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme === 'dark' ? 'dark' : 'light'];
  const { session, loading, profile, signOut } = useAuth();
  const pathname = usePathname();

  const isAuthRoute = AUTH_ROUTES.includes(pathname);
  const isAdminRoute = pathname.startsWith('/admin');

  const routingReady =
    !loading &&
    (!session || !!profile);

  const spinner = (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
      }}
    >
      <ActivityIndicator size="large" color="#2563EB" />
    </View>
  );

  // useEffect(() => {
  //   if (routingReady) {
  //     void SplashScreen.hideAsync();
  //   }
  // }, [routingReady]);

  // Don't render any route until auth + profile are ready
  if (!routingReady) {
    return spinner;
  }

  // Not logged in
  if (!session && !isAuthRoute) {
    return <Redirect href="/login" />;
  }

  // Logged in but on login/signup/forgot-password
  if (session && isAuthRoute) {
    if (profile?.role === 'super_admin') {
      return <Redirect href="/admin" />;
    }

    return <Redirect href="/" />;
  }

  // Role protection
  if (session && profile) {
    if (profile.is_blocked && !isAuthRoute) {
      return <Redirect href="/login" />;
    }

    if (
      profile.role === 'super_admin' &&
      !isAdminRoute &&
      !isAuthRoute
    ) {
      return <Redirect href="/admin" />;
    }

    if (
      profile.role === 'shop_owner' &&
      isAdminRoute
    ) {
      return <Redirect href="/" />;
    }
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: '600',
        },
        headerBackTitleVisible: false,
        contentStyle: {
          backgroundColor: colors.background,
        },
      }}
    >
      {/* Auth screens */}
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="signup" options={{ headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ headerShown: false }} />

      {/* Main shop owner screens */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="products" options={{ headerShown: false }} />
      <Stack.Screen name="customers" options={{ headerShown: false }} />
      <Stack.Screen name="new-sale" options={{ headerShown: false }} />
      <Stack.Screen name="profile" options={{ headerShown: false }} />
      <Stack.Screen name="scanner" options={{ headerShown: false }} />
      <Stack.Screen name="installment/[id]" options={{ title: 'Installment Detail' }} />

      {/* Admin screens */}
      <Stack.Screen name="admin/index" options={{ title: '', headerShown: false }} />
      <Stack.Screen name="admin/create-shop" options={{ title: 'Create New Shop', headerBackTitle: '', headerBackTitleVisible: false }} />
      <Stack.Screen name="admin/shop/[id]" options={{ title: 'Shop Details', headerBackTitle: '', headerBackTitleVisible: false }} />

      {/* Legacy redirects */}
      <Stack.Screen name="dashboard" options={{ headerShown: false }} />
      <Stack.Screen name="add-product" options={{ title: 'Add Product', presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutNav />
    </AuthProvider>
  );
}
