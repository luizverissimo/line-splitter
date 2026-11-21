import { checkAudioFileBasics } from '@line-splitter/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import { getBridge } from '../api/bridge';
import { subscribe as subscribeEvent } from '../api/events';

/** Arquivo solto na janela, já validado no cliente (ou o motivo da recusa). */
export type DroppedFile =
  { kind: 'file'; path: string; fileName: string } | { kind: 'error'; title: string; message: string };

interface FileDropState {
  /** Há um arquivo sendo arrastado sobre a janela. */
  dragging: boolean;
  /**
   * A tela Início assina para receber os arquivos soltos. Um arquivo solto em outra tela fica guardado
   * e é entregue assim que ela assinar. Devolve o cancelamento.
   */
  subscribe: (handler: (file: DroppedFile) => void) => () => void;
  /** Enquanto false (ex.: inspecionando ou separando), soltar arquivos é ignorado. */
  setAccepting: (accepting: boolean) => void;
  /** Menu Arquivo › Escolher arquivo…: a tela Início assina; vindo de outra tela, o pedido espera por ela. */
  subscribeChoose: (handler: () => void) => () => void;
}

const Ctx = createContext<FileDropState | null>(null);

function hasFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Arrastar e soltar na janela inteira (PRD §5.2): em qualquer tela, o arquivo vai para o Início.
 * Também impede o Chromium de tentar abrir o arquivo como página.
 */
export function FileDropProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [dragging, setDragging] = useState(false);
  const pending = useRef<DroppedFile | null>(null);
  const handler = useRef<((file: DroppedFile) => void) | null>(null);
  const chooseHandler = useRef<(() => void) | null>(null);
  const choosePending = useRef(false);
  const accepting = useRef(true);
  const [acceptingNow, setAcceptingNow] = useState(true);
  const depth = useRef(0);
  const pathname = useRef(location.pathname);
  useEffect(() => {
    pathname.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = accepting.current ? 'copy' : 'none';
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      // dragleave dispara ao passar para um elemento filho; só some quando sai da janela.
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);
      if (!accepting.current) return;
      const files = Array.from(e.dataTransfer?.files ?? []);
      let dropped: DroppedFile;
      if (files.length !== 1) {
        dropped = {
          kind: 'error',
          title: 'Solte um arquivo por vez',
          message: 'Envie apenas um arquivo de áudio.',
        };
      } else {
        const file = files[0] as File;
        const problem = checkAudioFileBasics(file.name, file.size);
        if (problem) {
          dropped = { kind: 'error', title: 'Não foi possível usar este arquivo', message: problem };
        } else {
          try {
            dropped = { kind: 'file', path: getBridge().pathForFile(file), fileName: file.name };
          } catch (err) {
            dropped = {
              kind: 'error',
              title: 'Não foi possível ler o arquivo solto',
              message: err instanceof Error ? err.message : String(err),
            };
          }
        }
      }
      if (handler.current) handler.current(dropped);
      else pending.current = dropped;
      if (pathname.current !== '/') void navigate('/');
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [navigate]);

  useEffect(() => {
    if (!window.api) return undefined;
    return subscribeEvent('menu:chooseFile', () => {
      if (!accepting.current) return;
      if (chooseHandler.current) chooseHandler.current();
      else choosePending.current = true;
      if (pathname.current !== '/') void navigate('/');
    });
  }, [navigate]);

  const subscribeChoose = useCallback((fn: () => void) => {
    chooseHandler.current = fn;
    if (choosePending.current) {
      choosePending.current = false;
      queueMicrotask(fn);
    }
    return () => {
      if (chooseHandler.current === fn) chooseHandler.current = null;
    };
  }, []);

  const subscribe = useCallback((fn: (file: DroppedFile) => void) => {
    handler.current = fn;
    const waiting = pending.current;
    pending.current = null;
    // Entrega fora do efeito de quem assinou.
    if (waiting) queueMicrotask(() => fn(waiting));
    return () => {
      if (handler.current === fn) handler.current = null;
    };
  }, []);

  const setAccepting = useCallback((value: boolean) => {
    accepting.current = value;
    setAcceptingNow(value);
  }, []);

  const value = useMemo(
    () => ({ dragging, subscribe, setAccepting, subscribeChoose }),
    [dragging, subscribe, setAccepting, subscribeChoose],
  );
  return (
    <Ctx.Provider value={value}>
      {children}
      {dragging && (
        <div className="drop-overlay" aria-hidden="true">
          <p>
            {acceptingNow
              ? 'Solte o arquivo de áudio para enviar'
              : 'Aguarde: o arquivo atual ainda está sendo lido'}
          </p>
        </div>
      )}
    </Ctx.Provider>
  );
}

export function useFileDrop(): FileDropState {
  const value = useContext(Ctx);
  if (!value) throw new Error('useFileDrop precisa estar dentro de FileDropProvider');
  return value;
}
