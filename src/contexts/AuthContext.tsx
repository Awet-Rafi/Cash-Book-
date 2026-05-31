import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  businessId: string | null;
  businessName: string | null;
  allBusinesses: any[];
  businessPin: string | null;
  isPinUnlocked: boolean;
  setPinUnlocked: (unlocked: boolean) => void;
  switchBusiness: (id: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  loading: true, 
  isAdmin: false,
  isSuperAdmin: false,
  businessId: null,
  businessName: null,
  allBusinesses: [],
  businessPin: null,
  isPinUnlocked: false,
  setPinUnlocked: () => {},
  switchBusiness: async () => {},
  refreshProfile: async () => {}
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState<string | null>(null);
  const [allBusinesses, setAllBusinesses] = useState<any[]>([]);
  const [businessPin, setBusinessPin] = useState<string | null>(null);
  const [isPinUnlocked, setIsPinUnlocked] = useState(false);

  const fetchUserProfile = async (uid: string, userEmail?: string | null) => {
    try {
      // 1. Fetch all businesses where user is owner or staff
      let businessesList: any[] = [];
      try {
        // Fetch owned businesses
        const qOwned = query(collection(db, 'businesses'), where('ownerId', '==', uid));
        const ownedSnapshot = await getDocs(qOwned);
        const owned = ownedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), role: 'owner' }));
        
        // Fetch staff businesses
        const qStaff = query(collection(db, 'businesses'), where('staffUids', 'array-contains', uid));
        const staffSnapshot = await getDocs(qStaff);
        const staff = staffSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), role: 'staff' }));
        
        // Merge and remove duplicates (though unique logic usually prevents this)
        const combined = [...owned];
        staff.forEach(s => {
          if (!combined.find(c => c.id === s.id)) {
            combined.push(s);
          }
        });
        
        businessesList = combined;
        setAllBusinesses(businessesList);
      } catch (err) {
        console.error("Error fetching businesses:", err);
      }

      // Check for cached businessId first to prevent UI flash
      let cachedBId = null;
      try {
        cachedBId = localStorage.getItem(`last_bid_${uid}`);
      } catch (e) {}

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

      // If no businessId found in profile, but user owns businesses, pick the first one ONLY if they have exactly one
      // Otherwise, let them pick their workspace on startup
      if (!bId && businessesList.length === 1) {
        bId = businessesList[0].id;
        // Update user profile with the first business found
        await setDoc(doc(db, 'userProfiles', uid), {
          uid,
          businessId: bId,
          email: userEmail || '',
          displayName: auth.currentUser?.displayName || 'User'
        }, { merge: true });
      } else if (!bId && businessesList.length > 1) {
        // Multiple businesses, don't auto-pick. Let user choose.
        setBusinessId(null);
      }

      if (bId) {
        setBusinessId(bId);
        try {
          localStorage.setItem(`last_bid_${uid}`, bId);
        } catch (e) {}
        
        const activeBusiness = businessesList.find(b => b.id === bId);
        if (activeBusiness) {
          setBusinessName(activeBusiness.name);
          setBusinessPin(activeBusiness.pin || null);
          
          try {
            if (sessionStorage.getItem(`pin_unlocked_${bId}`) === 'true') {
              setIsPinUnlocked(true);
            } else {
              setIsPinUnlocked(false);
            }
          } catch (e) {}
        } else {
          // Business might have been deleted or user no longer has access
          // Fetch specific business doc if not in list (could be staff access later)
          let bDoc;
          try {
            bDoc = await getDoc(doc(db, 'businesses', bId));
            if (bDoc && bDoc.exists()) {
              setBusinessName(bDoc.data().name);
              setBusinessPin(bDoc.data().pin || null);
            }
          } catch (err) {}
        }
      } else {
        setBusinessId(null);
        try {
          localStorage.removeItem(`last_bid_${uid}`);
        } catch (e) {}
        setBusinessName(null);
        setBusinessPin(null);
        setIsPinUnlocked(false);
      }

      // Compute dynamic admin privileges (Superadmin OR active business owner)
      const isSysAdmin = 
        userEmail?.toLowerCase() === 'tekle.taf@gmail.com' || 
        userEmail?.toLowerCase() === 'awet16@gmail.com';
      setIsSuperAdmin(isSysAdmin);

      let isOwnerOfActive = false;
      if (bId) {
        const activeBusiness = businessesList.find(b => b.id === bId);
        if (activeBusiness) {
          isOwnerOfActive = activeBusiness.role === 'owner';
        } else {
          let bDoc;
          try {
            bDoc = await getDoc(doc(db, 'businesses', bId));
            if (bDoc && bDoc.exists() && bDoc.data().ownerId === uid) {
              isOwnerOfActive = true;
            }
          } catch (err) {}
        }
      }
      setIsAdmin(isSysAdmin || isOwnerOfActive);
    } catch (error) {
      console.error("Error fetching user profile:", error);
    } finally {
      setLoading(false);
    }
  };

  const switchBusiness = async (id: string) => {
    if (!user) return;
    setLoading(true);
    try {
      // Clear PIN unlock state for all businesses to ensure a secure transition
      allBusinesses.forEach(b => {
        try {
          sessionStorage.removeItem(`pin_unlocked_${b.id}`);
        } catch (e) {}
      });

      await setDoc(doc(db, 'userProfiles', user.uid), {
        businessId: id
      }, { merge: true });
      
      // Reset PIN state when switching
      setIsPinUnlocked(false);
      
      if (id) {
        localStorage.setItem(`last_bid_${user.uid}`, id);
      } else {
        localStorage.removeItem(`last_bid_${user.uid}`);
      }
      
      // Refresh page to ensure all components clear their local state properly
      window.location.reload();
    } catch (err) {
      console.error("Error switching business:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check for emergency skip flag
    try {
      if (localStorage.getItem('force_skip_loading') === 'true') {
        localStorage.removeItem('force_skip_loading');
        setLoading(false);
      }
    } catch (e) {}

    // Safety timeout: If auth doesn't respond in 10 seconds, force loading to false
    const safetyTimeout = setTimeout(() => {
      setLoading(false);
    }, 10000);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      clearTimeout(safetyTimeout);
      setUser(user);
      const isSysAdmin = 
        user?.email?.toLowerCase() === 'tekle.taf@gmail.com' || 
        user?.email?.toLowerCase() === 'awet16@gmail.com';
      setIsSuperAdmin(isSysAdmin);
      setIsAdmin(isSysAdmin);
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
      try {
        if (unlocked) {
          sessionStorage.setItem(`pin_unlocked_${businessId}`, 'true');
        } else {
          sessionStorage.removeItem(`pin_unlocked_${businessId}`);
        }
      } catch (e) {}
    }
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      isAdmin, 
      isSuperAdmin,
      businessId, 
      businessName, 
      allBusinesses,
      businessPin, 
      isPinUnlocked,
      setPinUnlocked: handleSetPinUnlocked,
      switchBusiness,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
};
