import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';

export type SubscriptionBusyKey = 'processing' | 'quiz' | 'studyRoom';

type BusyMap = Record<SubscriptionBusyKey, boolean>;

const SubscriptionUpsellGateContext = createContext<{
  setBusy: (key: SubscriptionBusyKey, busy: boolean) => void;
  isBusy: () => boolean;
} | null>(null);

export const SubscriptionUpsellGateProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const busyRef = useRef<BusyMap>({
    processing: false,
    quiz: false,
    studyRoom: false,
  });
  const [, bump] = useState(0);

  const setBusy = useCallback((key: SubscriptionBusyKey, busy: boolean) => {
    if (busyRef.current[key] === busy) return;
    busyRef.current[key] = busy;
    bump((n) => n + 1);
  }, []);

  const isBusy = useCallback(() => Object.values(busyRef.current).some(Boolean), []);

  const value = useMemo(() => ({ setBusy, isBusy }), [setBusy, isBusy]);

  return (
    <SubscriptionUpsellGateContext.Provider value={value}>
      {children}
    </SubscriptionUpsellGateContext.Provider>
  );
};

export const useSubscriptionUpsellGate = () => {
  const ctx = useContext(SubscriptionUpsellGateContext);
  if (!ctx) {
    throw new Error('useSubscriptionUpsellGate must be used within SubscriptionUpsellGateProvider');
  }
  return ctx;
};
