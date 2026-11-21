import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import Modal from '../components/Modal';

const UIContext = createContext(null);

// Toast messages + promise-based confirm dialog:  if (await confirm({ message })) { ... }
export function UIProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);

  const push = useCallback((type, message) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const toast = useMemo(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }),
    [push]
  );

  const confirm = useCallback((opts) => new Promise((resolve) => setDialog({ ...opts, resolve })), []);

  const answer = (result) => {
    dialog.resolve(result);
    setDialog(null);
  };

  const icons = { success: CheckCircle2, error: AlertCircle, info: Info };

  return (
    <UIContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => {
          const Icon = icons[t.type];
          return (
            <div key={t.id} className={`toast toast-${t.type}`}>
              <Icon size={18} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
      {dialog && (
        <Modal
          title={dialog.title || 'Are you sure?'}
          size="sm"
          onClose={() => answer(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => answer(false)}>Cancel</button>
              <button className={`btn ${dialog.danger === false ? 'btn-primary' : 'btn-danger'}`} onClick={() => answer(true)}>
                {dialog.confirmText || 'Confirm'}
              </button>
            </>
          }
        >
          <p className="muted-text">{dialog.message}</p>
        </Modal>
      )}
    </UIContext.Provider>
  );
}

export const useUI = () => useContext(UIContext);
