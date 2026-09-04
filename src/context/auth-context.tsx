import { supabase } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

export type UserProfile = {
  id: string;
  role: 'super_admin' | 'shop_owner';
  shop_name: string | null;
  owner_name: string | null;
  phone: string | null;
  email?: string | null;
  initial_password?: string | null;
  device_limit: number;
  used_devices?: number;
  subscription_status: 'active' | 'inactive' | 'expired';
  subscription_expires: string | null;
  is_blocked: boolean;
  created_at: string | null;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  isAdmin: boolean;
  signInWithEmail: (
    email: string,
    pass: string
  ) => Promise<{ error: Error | null }>;
  signUpWithEmail: (
    email: string,
    pass: string,
    shopName?: string
  ) => Promise<{ data: any; error: Error | null }>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  loading: true,
  isAdmin: false,
  signInWithEmail: async () => ({ error: null }),
  signUpWithEmail: async () => ({ data: null, error: null }),
  resetPassword: async () => ({ error: null }),
  signOut: async () => { },
  refreshProfile: async () => { },
});

export function AuthProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const initialized = useRef(false);
  const signingIn = useRef(false);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) {
      setProfile(data as UserProfile);
      return;
    }

    // Fallback profile
    setProfile({
      id: userId,
      role: 'shop_owner',
      shop_name: null,
      owner_name: null,
      phone: null,
      device_limit: 10,
      subscription_status: 'active',
      subscription_expires: null,
      is_blocked: false,
      created_at: null,
    });
  }, []);

  /*
   * INITIAL AUTH
   *
   * This is the ONLY place where the initial session/profile
   * is loaded.
   */
  useEffect(() => {
    let mounted = true;

    const initializeAuth = async () => {
      try {
        const {
          data: { session: initialSession },
        } = await supabase.auth.getSession();

        if (!mounted) return;

        if (!initialSession) {
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
          initialized.current = true;
          return;
        }

        // IMPORTANT:
        // Load profile BEFORE exposing session to the UI.
        await fetchProfile(initialSession.user.id);

        if (!mounted) return;

        setSession(initialSession);
        setUser(initialSession.user);

        initialized.current = true;
        setLoading(false);
      } catch (error) {
        console.error('Auth initialization error:', error);

        if (mounted) {
          setSession(null);
          setUser(null);
          setProfile(null);
          initialized.current = true;
          setLoading(false);
        }
      }
    };

    void initializeAuth();

    /*
     * Auth changes AFTER initial auth has finished.
     */
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        // Ignore events while login function is handling auth.
        if (signingIn.current) return;

        // Ignore startup event because getSession()
        // already handled the initial state.
        if (!initialized.current) return;

        console.log('AUTH EVENT:', event);

        // Token refresh:
        // update session silently without touching profile/loading.
        if (event === 'TOKEN_REFRESHED') {
          if (newSession) {
            setSession(newSession);
            setUser(newSession.user);
          }
          return;
        }

        // SIGNED_OUT
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
          return;
        }

        // SIGNED_IN
        if (event === 'SIGNED_IN' && newSession) {
          // Load profile first.
          await fetchProfile(newSession.user.id);

          if (!mounted) return;

          setSession(newSession);
          setUser(newSession.user);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    if (!user?.id) return;

    await fetchProfile(user.id);
  }, [user?.id, fetchProfile]);

  async function signInWithEmail(
    email: string,
    pass: string
  ) {
    signingIn.current = true;

    try {
      const { data, error } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: pass,
        });

      if (error || !data.session || !data.user) {
        return { error };
      }

      /*
       * VERY IMPORTANT:
       * Profile first → session second.
       *
       * This prevents:
       * Login → Dashboard → Redirect → Dashboard
       */
      await fetchProfile(data.user.id);

      setUser(data.user);
      setSession(data.session);

      return { error: null };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error
            : new Error('Login failed'),
      };
    } finally {
      /*
       * Give Supabase's auth event enough time to finish
       * without racing with our login flow.
       */
      setTimeout(() => {
        signingIn.current = false;
      }, 300);
    }
  }

  async function signUpWithEmail(
    email: string,
    pass: string,
    shopName?: string
  ) {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password: pass,
      options: {
        data: {
          shop_name: shopName?.trim() ?? '',
          role: 'shop_owner',
        },
      },
    });

    return { data, error };
  }

  async function resetPassword(email: string) {
    const { error } =
      await supabase.auth.resetPasswordForEmail(
        email.trim()
      );

    return { error };
  }

  async function signOut() {
    await supabase.auth.signOut();

    setSession(null);
    setUser(null);
    setProfile(null);
  }

  const isAdmin = profile?.role === 'super_admin';

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        loading,
        isAdmin,
        signInWithEmail,
        signUpWithEmail,
        resetPassword,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}