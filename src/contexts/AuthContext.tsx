import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  businessId: string | null;
  businessName: string | null;
  businessPin: string | null;
  isPinUnlocked: boolean;
  setPinUnlocked: (unlocked: boolean) => void;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  loading: true, 
  isAdmin: false,
  businessId: null,
  businessName: null,
  businessPin: null,
  isPinUnlocked: false,
  setPinUnlocked: () => {},
  refreshProfile: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [businessPin, setBusinessPin] = useState<string | null>(null);
  const [isPinUnlocked, setIsPinUnlocked] = useState(false);

  const fetchUserProfile = async (uid: string, userEmail?: string | null) => {
    try {
      // Check for cached businessId first to prevent UI flash
      const cachedBId = localStorage.getItem(`last_bid_${uid}`);
      if (cachedBId && !businessId) {
        setBusinessId(cachedBId);
      }

      const docRef = doc(db, 'userProfiles', uid);
      let docSnap;
      try {
        docSnap = await getDoc(docRef);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `userProfiles/${uid}`);
        return;
      }

      let bId = (docSnap && docSnap.exists()) ? docSnap.data().businessId : null;

      // If no businessId found in profile, check if user owns any business (self-healing)
      if (!bId) {
        try {
          const q = query(collection(db, 'businesses'), where('ownerId', '==', uid));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            bId = querySnapshot.docs[0].id;
            // Re-create/Fix user profile
            await setDoc(doc(db, 'userProfiles', uid), {
              uid,
              businessId: bId,
              email: userEmail || '',
              displayName: auth.currentUser?.displayName || 'User'
            }, { merge: true });
          }
        } catch (err) {
          console.error("Error auto-recovering business profile:", err);
        }
      }

      if (bId) {
        setBusinessId(bId);
        localStorage.setItem(`last_bid_${uid}`, bId);
        let bDoc;
        try {
          bDoc = await getDoc(doc(db, 'businesses', bId));
        } catch (err) {
          handleFirestoreError(err, OperationType.GET, `businesses/${bId}`);
        }

        if (bDoc && bDoc.exists()) {
          setBusinessName(bDoc.data().name);
          setBusinessPin(bDoc.data().pin || null);
          
          if (sessionStorage.getItem(`pin_unlocked_${bId}`) === 'true') {
            setIsPinUnlocked(true);
          }
        }
      } else {
        setBusinessId(null);
        localStorage.removeItem(`last_bid_${uid}`);
        setBusinessName(null);
        setBusinessPin(null);
        setIsPinUnlocked(false);
      }
    } catch (error) {
      console.error("Error fetching user profile:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check for emergency skip flag
    if (localStorage.getItem('force_skip_loading') === 'true') {
      localStorage.removeItem('force_skip_loading');
      setLoading(false);
    }

    // Safety timeout: If auth doesn't respond in 10 seconds, force loading to false
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
    }, 10000);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      clearTimeout(safetyTimeout);
      setUser(user);
      setIsAdmin(
        user?.email?.toLowerCase() === 'tekle.taf@gmail.com' || 
        user?.email?.toLowerCase() === 'awet16@gmail.com'
      );
      if (user) {
        setLoading(true);
        fetchUserProfile(user.uid, user.email);
      } else {
        setBusinessId(null);
        setBusinessName(null);
        setBusinessPin(null);
        setIsPinUnlocked(false);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(safetyTimeout);
      unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (user) {
      await fetchUserProfile(user.uid, user.email);
    }
  };

  const handleSetPinUnlocked = (unlocked: boolean) => {
    setIsPinUnlocked(unlocked);
    if (businessId) {
      if (unlocked) {
        sessionStorage.setItem(`pin_unlocked_${businessId}`, 'true');
      } else {
        sessionStorage.removeItem(`pin_unlocked_${businessId}`);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      isAdmin, 
      businessId, 
      businessName, 
      businessPin, 
      isPinUnlocked,
      setPinUnlocked: handleSetPinUnlocked,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};
