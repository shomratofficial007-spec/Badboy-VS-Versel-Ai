import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  getAuth,
  getReactNativePersistence,
  initializeAuth,
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';

// Firebase Web configuration is public client configuration, not a service-account secret.
// Firestore Security Rules and Authentication enforce access to user data.
const firebaseConfig = {
  apiKey: 'AIzaSyBbAWp58-Xb-EvYA7rjpMAtEntBLwL8NMI',
  authDomain: 'badboy-ai-5caa3.firebaseapp.com',
  projectId: 'badboy-ai-5caa3',
  storageBucket: 'badboy-ai-5caa3.firebasestorage.app',
  messagingSenderId: '1083728939479',
  appId: '1:1083728939479:web:781cfa8f3b87a044976392',
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

function createAuth() {
  if (Platform.OS === 'web') return getAuth(firebaseApp);
  try {
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    // Fast refresh may initialize Auth before this module is re-evaluated.
    return getAuth(firebaseApp);
  }
}

export const firebaseAuth = createAuth();
export const firestore = getFirestore(firebaseApp);
