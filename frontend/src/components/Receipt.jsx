import { Printer } from 'lucide-react';
import Modal from './Modal';
import { Loader, ErrorState } from './State';
import useFetch from '../hooks/useFetch';
import { money, fmtDate, label } from '../utils/format';

// Printable payment receipt. Print styles in index.css hide everything except .receipt-print
export default function Receipt({ paymentId, onClose }) {
  const { data: r, loading, error } = useFetch(`/fees/payments/${paymentId}`);

  return (
    <Modal
      title="Payment receipt"
      onClose={onClose}
      footer={r && (
        <>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={() => window.print()}><Printer size={16} /> Print receipt</button>
        </>
      )}
    >
      {loading && <Loader />}
      {error && <ErrorState message={error} />}
      {r && (
        <div className="receipt receipt-print">
          <div className="receipt-head">
            <div>
              <h3>Hostel Management</h3>
              <p>Fee payment receipt</p>
            </div>
            <div className="receipt-no">
              <strong>{r.receipt_no}</strong>
              <span>{fmtDate(r.payment_date)}</span>
            </div>
          </div>

          <dl className="receipt-grid">
            <div><dt>Student</dt><dd>{r.student_name}</dd></div>
            <div><dt>Roll number</dt><dd>{r.roll_number}</dd></div>
            <div><dt>Course</dt><dd>{r.course}</dd></div>
            <div><dt>Room</dt><dd>{r.room_number ? `${r.hostel_name} / ${r.room_number} / Bed ${r.bed_number}` : '-'}</dd></div>
            <div><dt>Fee</dt><dd>{r.fee_title}</dd></div>
            <div><dt>Payment method</dt><dd>{label(r.method)}{r.reference ? ` (${r.reference})` : ''}</dd></div>
          </dl>

          <table className="receipt-sum">
            <tbody>
              <tr><td>Fee amount</td><td>{money(r.fee_amount)}</td></tr>
              <tr className="receipt-paid"><td>Paid in this receipt</td><td>{money(r.amount)}</td></tr>
              <tr><td>Total paid so far</td><td>{money(r.total_paid)}</td></tr>
              <tr><td>Balance due</td><td>{money(r.fee_amount - r.total_paid)}</td></tr>
            </tbody>
          </table>

          {r.remarks && <p className="receipt-note">Remarks: {r.remarks}</p>}
          <p className="receipt-foot">Received by {r.received_by_name || 'Hostel office'}. This is a computer-generated receipt.</p>
        </div>
      )}
    </Modal>
  );
}
