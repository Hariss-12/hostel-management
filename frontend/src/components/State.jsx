import { Loader2, AlertTriangle } from 'lucide-react';

export const Loader = ({ text = 'Loading...' }) => (
  <div className="state"><Loader2 className="spin" size={20} /> <span>{text}</span></div>
);

export const ErrorState = ({ message, onRetry }) => (
  <div className="state state-error">
    <AlertTriangle size={20} />
    <span>{message}</span>
    {onRetry && <button className="btn btn-ghost btn-sm" onClick={onRetry}>Try again</button>}
  </div>
);

export const Empty = ({ children }) => <div className="state state-empty">{children}</div>;
