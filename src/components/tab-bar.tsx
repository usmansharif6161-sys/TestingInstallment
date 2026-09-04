import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LayoutDashboard,
  Smartphone,
  PlusCircle,
  ScanLine,
  UserCircle2,
} from 'lucide-react-native';
import { useColorScheme } from '@/hooks/use-color-scheme';

type TabDef = {
  key: string;
  label: string;
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  route: string;
  match: string;
};

const TABS: TabDef[] = [
  { key: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard, route: '/',         match: '/'        },
  { key: 'products',  label: 'Products',  Icon: Smartphone,      route: '/products', match: '/products' },
  { key: 'new-sale',  label: 'New Sale',  Icon: PlusCircle,      route: '/new-sale', match: '/new-sale' },
  { key: 'scanner',   label: 'Setup',     Icon: ScanLine,        route: '/scanner',  match: '/scanner'  },
  { key: 'profile',   label: 'Profile',   Icon: UserCircle2,     route: '/profile',  match: '/profile'  },
];

export function TabBar() {
  const router   = useRouter();
  const pathname = usePathname();
  const insets   = useSafeAreaInsets();
  const scheme   = useColorScheme();
  const isDark   = scheme === 'dark';

  const bg       = isDark ? '#0D1117' : '#FFFFFF';
  const border   = isDark ? '#1F2937' : '#F1F5F9';
  const inactive = isDark ? '#4B5563' : '#9CA3AF';
  const active   = '#2563EB';
  const activeBg = isDark ? '#1E3A8A22' : '#EFF6FF';

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: bg,
          borderTopColor: border,
          paddingBottom: Math.max(insets.bottom, 8),
        },
      ]}>
      {TABS.map((tab) => {
        const isActive =
          tab.match === '/'
            ? pathname === '/' || pathname === ''
            : pathname.startsWith(tab.match);

        const iconColor = isActive ? active : inactive;

        return (
          <Pressable
            key={tab.key}
            style={styles.tab}
            onPress={() => {
              if (!isActive) {
                router.replace(tab.route as any);
              }
            }}>
            <View style={[styles.iconWrap, isActive && { backgroundColor: activeBg }]}>
              <tab.Icon size={22} color={iconColor} strokeWidth={isActive ? 2.2 : 1.8} />
            </View>
            <Text style={[styles.label, { color: iconColor }]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 8,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
    }),
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  iconWrap: {
    width: 46,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
