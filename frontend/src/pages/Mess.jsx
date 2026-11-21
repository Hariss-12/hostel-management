import { useState } from 'react';
import { Pencil, Trash2, Plus } from 'lucide-react';
import api, { errorMessage, fieldErrors } from '../api/client';
import useFetch from '../hooks/useFetch';
import useForm from '../hooks/useForm';
import { useAuth } from '../context/AuthContext';
import { useUI } from '../context/UIContext';
import PageHeader from '../components/PageHeader';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Tabs from '../components/Tabs';
import { Loader, ErrorState } from '../components/State';
import { Input, Select, TextArea } from '../components/FormControls';
import { DAYS, MEALS, label, todayISO, fmtDate } from '../utils/format';

export default function Mess() {
  const { user } = useAuth();
  const isStudent = user.role === 'student';
  const [tab, setTab] = useState('menu');
  return (
    <>
      <PageHeader title="Mess" subtitle={isStudent ? 'The weekly menu, and meals you will skip.' : 'Weekly menu and daily meal headcount.'} />
      <Tabs active={tab} onChange={setTab} tabs={[{ key: 'menu', label: 'Weekly menu' }, isStudent ? { key: 'skip', label: 'Skip a meal' } : { key: 'count', label: 'Meal headcount' }]} />
      {tab === 'menu' && <Menu canEdit={!isStudent} />}
      {tab === 'skip' && <SkipMeals />}
      {tab === 'count' && <Headcount />}
    </>
  );
}

function Menu({ canEdit }) {
  const { toast, confirm } = useUI();
  const { data, loading, error, reload } = useFetch('/mess/menu');
  const [cell, setCell] = useState(null); // { day, meal, entry }
  const [saving, setSaving] = useState(false);
  const form = useForm({ items: '' }, { items: { required: true, maxLength: 300, label: 'the menu items' } });
  const todayIso = (new Date().getDay() + 6) % 7 + 1; // 1 = Monday

  if (loading) return <Loader />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const entry = (day, meal) => data.find((m) => m.day_of_week === day && m.meal_type === meal);

  const open = (day, meal) => {
    const e = entry(day, meal);
    form.reset({ items: e ? e.items : '' });
    setCell({ day, meal, entry: e });
  };

  const save = async (e) => {
    e.preventDefault();
    if (!form.validate()) return;
    setSaving(true);
    try {
      await api.put('/mess/menu', { day_of_week: cell.day, meal_type: cell.meal, items: form.values.items });
      toast.success('Menu saved');
      setCell(null);
      reload();
    } catch (err) {
      form.setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (day, meal, e) => {
    if (!(await confirm({ title: 'Remove meal', message: `Remove ${label(meal)} on ${DAYS[day - 1]} from the menu?`, confirmText: 'Remove' }))) return;
    try {
      await api.delete(`/mess/menu/${e.id}`);
      toast.success('Removed');
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <>
      <div className="card table-card"><div className="table-wrap">
        <table className="menu-table">
          <thead><tr><th>Day</th>{MEALS.map((m) => <th key={m}>{label(m)}</th>)}</tr></thead>
          <tbody>
            {DAYS.map((d, i) => (
              <tr key={d} style={i + 1 === todayIso ? { background: 'var(--brass-soft)' } : undefined}>
                <td>{d}{i + 1 === todayIso && <span className="cell-sub">Today</span>}</td>
                {MEALS.map((m) => {
                  const e = entry(i + 1, m);
                  return (
                    <td key={m}>
                      <div className="menu-cell">
                        <span className={e ? '' : 'empty'}>{e ? e.items : 'Not set'}</span>
                        {canEdit && (
                          <span className="row-actions" style={{ flexWrap: 'nowrap' }}>
                            <button className="icon-btn" title="Edit" onClick={() => open(i + 1, m)}>{e ? <Pencil size={15} /> : <Plus size={15} />}</button>
                            {e && <button className="icon-btn" title="Remove" onClick={() => remove(i + 1, m, e)}><Trash2 size={15} /></button>}
                          </span>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div></div>

      {cell && (
        <Modal title={`${DAYS[cell.day - 1]}, ${label(cell.meal)}`} size="sm" onClose={() => setCell(null)}
          footer={<><button className="btn btn-ghost" onClick={() => setCell(null)}>Cancel</button><button className="btn btn-primary" form="menu-form" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></>}>
          <form id="menu-form" onSubmit={save} noValidate>
            <TextArea label="Menu items" required placeholder="e.g. Idli, sambar, coconut chutney" name="items" value={form.values.items} onChange={form.handleChange} error={form.errors.items} />
          </form>
        </Modal>
      )}
    </>
  );
}

function SkipMeals() {
  const { toast } = useUI();
  const { data, loading, error, reload } = useFetch('/mess/opt-outs/mine');
  const [saving, setSaving] = useState(false);
  const form = useForm({ meal_date: todayISO(), meal_type: 'lunch' }, { meal_date: { required: true, label: 'a date' } });

  const add = async (e) => {
    e.preventDefault();
    if (!form.validate()) return;
    setSaving(true);
    try {
      await api.post('/mess/opt-outs', form.values);
      toast.success('Meal skipped. The mess has been told.');
      reload();
    } catch (err) {
      form.setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const restore = async (o) => {
    try {
      await api.delete(`/mess/opt-outs/${o.id}`);
      toast.success('Meal restored');
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  };

  return (
    <div className="grid grid-2">
      <section className="card panel">
        <div className="panel-head"><h3>Skip a meal</h3></div>
        <p className="muted-text" style={{ marginBottom: 14 }}>Tell the mess you will not eat, so food is not wasted.</p>
        <form className="form-grid" onSubmit={add} noValidate>
          <Input label="Date" type="date" min={todayISO()} name="meal_date" value={form.values.meal_date} onChange={form.handleChange} error={form.errors.meal_date} />
          <Select label="Meal" options={MEALS.map((m) => ({ value: m, label: label(m) }))} name="meal_type" value={form.values.meal_type} onChange={form.handleChange} error={form.errors.meal_type} />
          <div className="span-2"><button className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Skip this meal'}</button></div>
        </form>
      </section>
      <section className="card panel">
        <div className="panel-head"><h3>My skipped meals</h3></div>
        {loading && <Loader />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {data && (
          <div className="list">
            {data.length === 0 && <div className="list-empty">You have not skipped any upcoming meals.</div>}
            {data.map((o) => (
              <div className="list-row" key={o.id}>
                <div><strong>{label(o.meal_type)}</strong><small>{fmtDate(o.meal_date)}</small></div>
                <button className="btn btn-ghost btn-sm" onClick={() => restore(o)}>Restore</button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Headcount() {
  const [date, setDate] = useState(todayISO());
  const { data, loading, error, reload } = useFetch('/mess/summary', { date });

  return (
    <>
      <div className="card panel" style={{ marginBottom: 16, maxWidth: 280 }}>
        <label className="field"><span className="field-label">Date</span><input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
      </div>
      {loading && <Loader />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <>
          <div className="meal-cards">
            {data.meals.map((m) => (
              <div className="card meal-card" key={m.meal_type}>
                <h4>{label(m.meal_type)}</h4>
                <div className="big">{m.expected}</div>
                <p>{m.opted_out} of {data.total} skipping</p>
                <p style={{ marginTop: 6, color: 'var(--ink)' }}>{m.items || 'Menu not set'}</p>
              </div>
            ))}
          </div>
          <h3 style={{ margin: '4px 0 10px' }}>Skipped meals on {fmtDate(data.date)}</h3>
          <DataTable rows={data.opt_outs} searchKeys={['student_name', 'roll_number']} empty="Nobody has skipped a meal on this date."
            columns={[
              { key: 'student_name', header: 'Student', render: (o) => <><strong>{o.student_name}</strong><span className="cell-sub">{o.roll_number}</span></> },
              { key: 'meal_type', header: 'Meal', render: (o) => label(o.meal_type) },
            ]} />
        </>
      )}
    </>
  );
}
