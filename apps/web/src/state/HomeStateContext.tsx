import type { AudioInfo, Stem } from '@line-splitter/shared';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';

export type HomeState =
  | { kind: 'empty' }
  | { kind: 'inspecting'; fileName: string }
  | { kind: 'error'; title: string; error: unknown }
  | { kind: 'ready'; audio: AudioInfo };

interface HomeStateValue {
  state: HomeState;
  setState: Dispatch<SetStateAction<HomeState>>;
  stem: Stem | null;
  setStem: Dispatch<SetStateAction<Stem | null>>;
}

const Ctx = createContext<HomeStateValue | null>(null);

/** Arquivo atual e instrumento escolhido, acima das rotas: sair do Início e voltar não perde nada. */
export function HomeStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<HomeState>({ kind: 'empty' });
  const [stem, setStem] = useState<Stem | null>(null);
  const value = useMemo(() => ({ state, setState, stem, setStem }), [state, stem]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHomeState(): HomeStateValue {
  const value = useContext(Ctx);
  if (!value) throw new Error('useHomeState precisa estar dentro de HomeStateProvider');
  return value;
}
