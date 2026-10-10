import { createMobileAuth } from '@shopinbos/api-client/mobile';
import * as SecureStore from 'expo-secure-store';

/** Session tokens live in the device keychain / keystore. */
const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const auth = createMobileAuth({
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://app.shopinbos.com',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey:
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
    '',
  storage: secureStorage,
});

export const APP = 'SELLER' as const;
