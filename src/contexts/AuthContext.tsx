import React, { createContext, useContext, useEffect, useState } from 'react';
import insforge from '@/lib/insforge';
import { UserProfile, UserRole } from '@/types';

interface AuthContextType {
  user: any | null;
  profile: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (params: {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    department: string;
    roll_number?: string;
  }) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Fetch or reload profile data from public.profiles table
  const fetchProfile = async (userId: string): Promise<UserProfile | null> => {
    try {
      const { data, error } = await insforge.database
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.warn('[AuthContext] Profile fetch notice:', error.message || error);
        return null;
      }
      return data as UserProfile;
    } catch (err) {
      console.error('[AuthContext] Profile fetch unexpected error:', err);
      return null;
    }
  };

  const loadSession = async () => {
    setLoading(true);
    try {
      const { data, error } = await insforge.auth.getCurrentUser();
      if (error || !data?.user) {
        setUser(null);
        setProfile(null);
      } else {
        const currentUser = data.user;
        setUser(currentUser);
        const userProfile = await fetchProfile(currentUser.id);
        setProfile(userProfile);
      }
    } catch (err) {
      console.error('[AuthContext] Session load error:', err);
      setUser(null);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();

    // Subscribe to InsForge auth state changes
    const unsubscribe = insforge.auth.onAuthStateChange(async () => {
      await loadSession();
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    setLoading(true);
    try {
      const { data, error } = await insforge.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data) {
        setLoading(false);
        return { error: error?.message || 'Failed to authenticate. Please check credentials.' };
      }

      setUser(data.user);
      const userProfile = await fetchProfile(data.user.id);
      setProfile(userProfile);
      setLoading(false);
      return { error: null };
    } catch (err: any) {
      setLoading(false);
      return { error: err?.message || 'An unexpected authentication error occurred.' };
    }
  };

  const signUp = async ({
    email,
    password,
    name,
    role,
    department,
    roll_number,
  }: {
    email: string;
    password: string;
    name: string;
    role: UserRole;
    department: string;
    roll_number?: string;
  }): Promise<{ error: string | null }> => {
    setLoading(true);
    try {
      const { data, error } = await insforge.auth.signUp({
        email,
        password,
        name,
      });

      if (error || !data?.user) {
        setLoading(false);
        return { error: error?.message || 'Account registration failed.' };
      }

      const createdUser = data.user;
      setUser(createdUser);

      // Create linked profile in public.profiles table
      const { error: profileError } = await insforge.database
        .from('profiles')
        .insert([
          {
            id: createdUser.id,
            email: createdUser.email,
            name,
            role,
            department,
            roll_number: roll_number || null,
          },
        ]);

      if (profileError) {
        console.error('[AuthContext] Profile insert error:', profileError);
      }

      const userProfile = await fetchProfile(createdUser.id);
      setProfile(userProfile);
      setLoading(false);
      return { error: null };
    } catch (err: any) {
      setLoading(false);
      return { error: err?.message || 'An unexpected registration error occurred.' };
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await insforge.auth.signOut();
      setUser(null);
      setProfile(null);
    } catch (err) {
      console.error('[AuthContext] Sign out error:', err);
    } finally {
      setLoading(false);
    }
  };

  const refreshProfile = async () => {
    if (user?.id) {
      const updated = await fetchProfile(user.id);
      setProfile(updated);
    }
  };

  const effectiveRole = profile?.role || null;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        role: effectiveRole,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
