import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, CheckCheck, Trash2 } from 'lucide-react';
import api, { errorMessage, fieldErrors } from '../api/client';
import useFetch from '../hooks/useFetch';
import useForm from '../hooks/useForm';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import PageHeader from '../components/PageHeader';
import Modal from '../components/Modal';
import { Loader, ErrorState, Empty } from '../components/State';
import { Input, Select, TextArea } from '../components/FormControls';
import { fmtDateTime } from '../utils/format';

export default function Notifications() {
  const { user } = useAuth();
  const { toast } = useUI();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useFetch('/notifications');
  const hostels = useFetch('/hostels', undefined, ['admin', 'warden'].includes(user.role));
  const [composing, setComposing] = useState(false);
  const [sending, setSending] = useState(false);
  const isStaff = user.role === 'admin' || user.role === 'warden';
  const form = useForm({ target: 'students', hostel_id: '', title: '', message: '' }, {
    title: { required: true, maxLength: 150, label: 'a title' }, message: { required: true, maxLength: 1000, label: 'a message' },
  });

  const targets = [
    { value: 'students', label: 'All students' }, { value: 'hostel', label: 'Students of one hostel' }, { value: 'maintenance', label: 'Maintenance staff' },
    ...(user.role === 'admin' ? [{ value: 'wardens', label: 'Wardens' }, { value: 'all', label: 'Everyone' }] : []),
  ];

  const openItem = async (n) => {
    if (!n.is_read) {
      await api.put(`/notifications/${n.id}/read`).catch(() => {});
      reload();
    }
    if (n.link) navigate(n.link);
  };
  const markAll = async () => { await api.put('/notifications/read-all'); reload(); };
  const remove = async (n) => { await api.delete(`/notifications/${n.id}`); reload(); };

  const send = async (e) => {
    e.preventDefault();
    if (!form.validate((v) => ({ hostel_id: v.target === 'hostel' && !v.hostel_id ? 'Choose a hostel' : '' }))) return;
    setSending(true);
    try {
      const res = await api.post('/notifications/broadcast', form.values);
      toast.success(`Announcement sent to ${res.data.sent} people`);
      setComposing(false);
    } catch (err) {
      form.setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const bind = (n) => ({ name: n, value: form.values[n], onChange: form.handleChange, error: form.errors[n] });

  return (
    <>
      <PageHeader title="Notifications" subtitle={data ? `${data.unread} unread` : undefined}
        actions={<>
          <button className="btn btn-ghost" onClick={markAll} disabled={!data || !data.unread}><CheckCheck size={16} /> Mark all as read</button>
          {isStaff && <button className="btn btn-primary" onClick={() => { form.reset({ target: 'students', hostel_id: '', title: '', message: '' }); setComposing(true); }}><Megaphone size={16} /> Send announcement</button>}
        </>} />

      {loading && <Loader />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <div className="card">
          {data.items.length === 0 && <Empty>You are all caught up. New alerts appear here.</Empty>}
          {data.items.map((n) => (
            <div className={`notif ${n.is_read ? '' : 'unread'}`} key={n.id}>
              <button className="notif-link notif-body" onClick={() => openItem(n)}>
                <strong>{n.title}</strong>
                <p>{n.message}</p>
                <small>{fmtDateTime(n.created_at)}</small>
              </button>
              <button className="icon-btn" title="Delete" onClick={() => remove(n)}><Trash2 size={16} /></button>
            </div>
          ))}
        </div>
      )}

      {composing && (
        <Modal title="Send announcement" onClose={() => setComposing(false)}
          footer={<><button className="btn btn-ghost" onClick={() => setComposing(false)}>Cancel</button><button className="btn btn-primary" form="announce-form" disabled={sending}>{sending ? 'Sending...' : 'Send'}</button></>}>
          <form id="announce-form" className="form-grid" onSubmit={send} noValidate>
            <Select className="span-2" label="Send to" required options={targets} {...bind('target')} />
            {form.values.target === 'hostel' && <Select className="span-2" label="Hostel" required placeholder="Select a hostel" options={(hostels.data || []).map((h) => ({ value: String(h.id), label: h.name }))} {...bind('hostel_id')} />}
            <Input className="span-2" label="Title" required {...bind('title')} />
            <TextArea className="span-2" label="Message" required rows={4} {...bind('message')} />
          </form>
        </Modal>
      )}
    </>
  );
}
