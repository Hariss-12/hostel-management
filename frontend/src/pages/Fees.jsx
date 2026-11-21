import { useState } from 'react';
import { Plus, Pencil, Trash2, HandCoins, FileText } from 'lucide-react';
import api, { errorMessage, fieldErrors } from '../api/client';
import useFetch from '../hooks/useFetch';
import useForm from '../hooks/useForm';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Tabs from '../components/Tabs';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import Receipt from '../components/Receipt';
import { Input, Select, TextArea } from '../components/FormControls';
import { money, fmtDate, label, todayISO } from '../utils/format';
import { Wallet, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Fees() {
  const { user } = useAuth();
  return user.role === 'student' ? <StudentFees /> : <StaffFees />;
}

const METHODS = ['cash', 'upi', 'card', 'bank_transfer', 'cheque'].map((m) => ({ value: m, label: label(m) }));

function paymentColumns(onReceipt, showStudent) {
  return [
    { key: 'receipt_no', header: 'Receipt', sortable: true },
    ...(showStudent ? [{ key: 'student_name', header: 'Student', sortable: true, render: (p) => <><strong>{p.student_name}</strong><span className="cell-sub">{p.roll_number}</span></> }] : []),
    { key: 'fee_title', header: 'Fee' },
    { key: 'amount', header: 'Amount', sortable: true, render: (p) => money(p.amount) },
    { key: 'method', header: 'Method', render: (p) => label(p.method) },
    { key: 'payment_date', header: 'Date', sortable: true, render: (p) => fmtDate(p.payment_date) },
    { key: 'actions', header: '', className: 'right', render: (p) => <button className="btn btn-ghost btn-sm" onClick={() => onReceipt(p.id)}><FileText size={15} /> Receipt</button> },
  ];
}

/* ---------------------------- Student view ---------------------------- */
function StudentFees() {
  const fees = useFetch('/fees/mine');
  const payments = useFetch('/fees/payments');
  const [receiptId, setReceiptId] = useState(null);

  const list = fees.data || [];
  const billed = list.reduce((s, f) => s + f.amount, 0);
  const paid = list.reduce((s, f) => s + f.paid_amount, 0);
  const overdue = list.filter((f) => f.status === 'overdue').reduce((s, f) => s + f.balance, 0);

  const cols = [
    { key: 'title', header: 'Fee', sortable: true },
    { key: 'amount', header: 'Amount', render: (f) => money(f.amount) },
    { key: 'paid_amount', header: 'Paid', render: (f) => money(f.paid_amount) },
    { key: 'balance', header: 'Balance', render: (f) => money(f.balance) },
    { key: 'due_date', header: 'Due date', sortable: true, render: (f) => fmtDate(f.due_date) },
    { key: 'status', header: 'Status', render: (f) => <StatusBadge value={f.status} /> },
  ];

  return (
    <>
      <PageHeader title="Fees" subtitle="What you owe, what you have paid, and your receipts." />
      <div className="grid grid-stats">
        <StatCard label="Total billed" value={money(billed)} icon={Wallet} />
        <StatCard label="Paid" value={money(paid)} icon={CheckCircle2} tone="ok" />
        <StatCard label="Balance due" value={money(billed - paid)} icon={AlertCircle} tone={billed - paid > 0 ? 'danger' : 'default'} hint={overdue > 0 ? `${money(overdue)} is overdue` : undefined} />
      </div>
      <h3 style={{ margin: '8px 0 10px' }}>Fee statement</h3>
      {fees.error ? <div className="form-error">{fees.error}</div> : <DataTable columns={cols} rows={list} loading={fees.loading} filters={[{ key: 'status', label: 'All statuses', options: ['pending', 'partial', 'paid', 'overdue'] }]} empty="No fees have been added for you." />}
      <h3 style={{ margin: '22px 0 10px' }}>Payment history</h3>
      <DataTable columns={paymentColumns(setReceiptId, false)} rows={payments.data || []} loading={payments.loading} empty="No payments recorded yet." />
      {receiptId && <Receipt paymentId={receiptId} onClose={() => setReceiptId(null)} />}
    </>
  );
}

/* ----------------------------- Staff view ----------------------------- */
function StaffFees() {
  const { toast, confirm } = useUI();
  const [tab, setTab] = useState('fees');
  const fees = useFetch('/fees');
  const payments = useFetch('/fees/payments');
  const students = useFetch('/students');
  const hostels = useFetch('/hostels');
  const [feeModal, setFeeModal] = useState(null); // 'new' | fee row (edit)
  const [payFee, setPayFee] = useState(null);
  const [receiptId, setReceiptId] = useState(null);
  const [saving, setSaving] = useState(false);

  const feeForm = useForm({ scope: 'student', student_id: '', hostel_id: '', title: '', amount: '', due_date: '' }, {
    title: { required: true, maxLength: 120, label: 'a title' },
    amount: { required: true, type: 'number', min: 1, label: 'the amount' },
    due_date: { required: true, label: 'a due date' },
  });
  const payForm = useForm({ amount: '', method: 'cash', payment_date: todayISO(), reference: '', remarks: '' }, {
    amount: { required: true, type: 'number', min: 1, label: 'the amount' },
  });

  const refresh = () => { fees.reload(); payments.reload(); };
  const isNew = feeModal === 'new';

  const openFee = (f) => {
    feeForm.reset(f === 'new' ? { scope: 'student', student_id: '', hostel_id: '', title: '', amount: '', due_date: '' } : { scope: 'student', student_id: '', hostel_id: '', title: f.title, amount: String(f.amount), due_date: f.due_date });
    setFeeModal(f);
  };

  const submitFee = async (e) => {
    e.preventDefault();
    const v = feeForm.values;
    if (!feeForm.validate((x) => ({
      student_id: isNew && x.scope === 'student' && !x.student_id ? 'Choose a student' : '',
      hostel_id: isNew && x.scope === 'hostel' && !x.hostel_id ? 'Choose a hostel' : '',
    }))) return;
    setSaving(true);
    try {
      if (isNew) {
        const res = await api.post('/fees', v);
        toast.success(`Fee added for ${res.data.created} student${res.data.created === 1 ? '' : 's'}`);
      } else {
        await api.put(`/fees/${feeModal.id}`, { title: v.title, amount: v.amount, due_date: v.due_date });
        toast.success('Fee updated');
      }
      setFeeModal(null);
      refresh();
    } catch (err) {
      feeForm.setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const openPay = (f) => {
    payForm.reset({ amount: String(f.balance), method: 'cash', payment_date: todayISO(), reference: '', remarks: '' });
    setPayFee(f);
  };

  const submitPay = async (e) => {
    e.preventDefault();
    if (!payForm.validate((x) => ({ amount: Number(x.amount) > payFee.balance ? `Balance is ${money(payFee.balance)}` : '' }))) return;
    setSaving(true);
    try {
      const res = await api.post(`/fees/${payFee.id}/payments`, payForm.values);
      toast.success(`Payment recorded. Receipt ${res.data.receipt_no}`);
      setPayFee(null);
      refresh();
      setReceiptId(res.data.id);
    } catch (err) {
      payForm.setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const removeFee = async (f) => {
    if (!(await confirm({ title: 'Delete fee', message: `Delete "${f.title}" for ${f.student_name}?`, confirmText: 'Delete' }))) return;
    try {
      await api.delete(`/fees/${f.id}`);
      toast.success('Fee deleted');
      refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  const feeCols = [
    { key: 'student_name', header: 'Student', sortable: true, render: (f) => <><strong>{f.student_name}</strong><span className="cell-sub">{f.roll_number}</span></> },
    { key: 'title', header: 'Fee', sortable: true },
    { key: 'amount', header: 'Amount', sortable: true, render: (f) => money(f.amount) },
    { key: 'paid_amount', header: 'Paid', render: (f) => money(f.paid_amount) },
    { key: 'balance', header: 'Balance', sortable: true, render: (f) => money(f.balance) },
    { key: 'due_date', header: 'Due', sortable: true, render: (f) => fmtDate(f.due_date) },
    { key: 'status', header: 'Status', render: (f) => <StatusBadge value={f.status} /> },
    { key: 'actions', header: '', className: 'right', render: (f) => (
      <div className="row-actions">
        {f.balance > 0 && <button className="btn btn-ghost btn-sm" onClick={() => openPay(f)}><HandCoins size={15} /> Record payment</button>}
        <button className="icon-btn" title="Edit" onClick={() => openFee(f)}><Pencil size={16} /></button>
        <button className="icon-btn" title="Delete" onClick={() => removeFee(f)}><Trash2 size={16} /></button>
      </div>
    ) },
  ];

  const fb = (n) => ({ name: n, value: feeForm.values[n], onChange: feeForm.handleChange, error: feeForm.errors[n] });
  const pb = (n) => ({ name: n, value: payForm.values[n], onChange: payForm.handleChange, error: payForm.errors[n] });
  const scope = feeForm.values.scope;

  return (
    <>
      <PageHeader title="Fees & payments" subtitle="Bill students, record payments and issue receipts."
        actions={<button className="btn btn-primary" onClick={() => openFee('new')}><Plus size={16} /> Add fee</button>} />
      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'fees', label: 'Fees' }, { key: 'payments', label: 'Payment records' }]} />

      {tab === 'fees' && (fees.error ? <div className="form-error">{fees.error}</div> : (
        <DataTable columns={feeCols} rows={fees.data || []} loading={fees.loading} searchKeys={['student_name', 'roll_number', 'title']}
          searchPlaceholder="Search by student or fee"
          filters={[{ key: 'status', label: 'All statuses', options: ['pending', 'partial', 'paid', 'overdue'] }]} empty="No fees yet. Use Add fee to bill students." />
      ))}
      {tab === 'payments' && (payments.error ? <div className="form-error">{payments.error}</div> : (
        <DataTable columns={paymentColumns(setReceiptId, true)} rows={payments.data || []} loading={payments.loading} searchKeys={['receipt_no', 'student_name', 'roll_number', 'fee_title']}
          filters={[{ key: 'method', label: 'All methods', options: METHODS }]} empty="No payments recorded yet." />
      ))}

      {feeModal && (
        <Modal title={isNew ? 'Add fee' : 'Edit fee'} onClose={() => setFeeModal(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setFeeModal(null)}>Cancel</button><button className="btn btn-primary" form="fee-form" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}>
          <form id="fee-form" className="form-grid" onSubmit={submitFee} noValidate>
            {isNew && <Select className="span-2" label="Bill" required options={[{ value: 'student', label: 'One student' }, { value: 'hostel', label: 'Every student in a hostel' }, { value: 'all', label: 'All active students' }]} {...fb('scope')} />}
            {isNew && scope === 'student' && <Select className="span-2" label="Student" required placeholder="Select a student" options={(students.data || []).filter((s) => s.status === 'active').map((s) => ({ value: String(s.id), label: `${s.name} (${s.roll_number})` }))} {...fb('student_id')} />}
            {isNew && scope === 'hostel' && <Select className="span-2" label="Hostel" required placeholder="Select a hostel" options={(hostels.data || []).map((h) => ({ value: String(h.id), label: h.name }))} {...fb('hostel_id')} />}
            <Input className="span-2" label="Title" required placeholder="e.g. Room rent, January" {...fb('title')} />
            <Input label="Amount (INR)" type="number" min="1" step="0.01" required {...fb('amount')} />
            <Input label="Due date" type="date" required {...fb('due_date')} />
          </form>
        </Modal>
      )}

      {payFee && (
        <Modal title="Record payment" onClose={() => setPayFee(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setPayFee(null)}>Cancel</button><button className="btn btn-primary" form="pay-form" disabled={saving}>{saving ? 'Saving...' : 'Save and view receipt'}</button></>}>
          <p className="muted-text" style={{ marginBottom: 14 }}>{payFee.student_name}, {payFee.title}. Balance {money(payFee.balance)}.</p>
          <form id="pay-form" className="form-grid" onSubmit={submitPay} noValidate>
            <Input label="Amount (INR)" type="number" min="1" step="0.01" required {...pb('amount')} />
            <Select label="Method" required options={METHODS} {...pb('method')} />
            <Input label="Payment date" type="date" max={todayISO()} {...pb('payment_date')} />
            <Input label="Reference no." placeholder="UPI id, cheque no." {...pb('reference')} />
            <TextArea className="span-2" label="Remarks" rows={2} {...pb('remarks')} />
          </form>
        </Modal>
      )}
      {receiptId && <Receipt paymentId={receiptId} onClose={() => setReceiptId(null)} />}
    </>
  );
}
