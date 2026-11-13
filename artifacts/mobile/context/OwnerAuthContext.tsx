import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  clearOwnerToken,
  restoreOwnerSession,
  saveOwnerToken,
  subscribeToOwnerSessionExpiry,
  verifyOwnerToken,
} from '@/lib/assistant/ownerAuth';

interface OwnerAuthContextValue {
  ready: boolean;
  authenticated: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const OwnerAuthContext = createContext<OwnerAuthContextValue | null>(null);

export function useOwnerAuth() {
  const value = useContext(OwnerAuthContext);
  if (!value) throw new Error('useOwnerAuth must be used inside OwnerAuthProvider.');
  return value;
}

export function OwnerAuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let mounted = true;
    const unsubscribe = subscribeToOwnerSessionExpiry(() => {
      if (mounted) setAuthenticated(false);
    });
    restoreOwnerSession()
      .then((valid) => {
        if (mounted) {
          setAuthenticated(valid);
          setReady(true);
        }
      })
      .catch(() => {
        if (mounted) {
          setAuthenticated(false);
          setReady(true);
        }
      });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (token: string) => {
    const normalized = token.trim();
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(normalized)) {
      throw new Error('Owner Token-এর ফরম্যাট সঠিক নয়।');
    }
    const sessionToken = await verifyOwnerToken(normalized);
    await saveOwnerToken(sessionToken);
    setAuthenticated(true);
  }, []);

  const signOut = useCallback(async () => {
    await clearOwnerToken();
    setAuthenticated(false);
  }, []);

  const value = useMemo(
    () => ({ ready, authenticated, signIn, signOut }),
    [ready, authenticated, signIn, signOut],
  );

  return <OwnerAuthContext.Provider value={value}>{children}</OwnerAuthContext.Provider>;
}
