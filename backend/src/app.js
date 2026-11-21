require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { notFound, errorHandler } = require('./middleware/error');

const app = express();

app.use(cors({ origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',').map((s) => s.trim()) : true }));
app.use(express.json());

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/staff', require('./routes/staff.routes'));
app.use('/api/students', require('./routes/students.routes'));
app.use('/api', require('./routes/hostel.routes')); // /hostels, /rooms, /beds
app.use('/api/allocations', require('./routes/allocations.routes'));
app.use('/api/fees', require('./routes/fees.routes'));
app.use('/api/attendance', require('./routes/attendance.routes'));
app.use('/api/leaves', require('./routes/leaves.routes'));
app.use('/api/mess', require('./routes/mess.routes'));
app.use('/api/complaints', require('./routes/complaints.routes'));
app.use('/api/notifications', require('./routes/notifications.routes'));
app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/reports', require('./routes/reports.routes'));

app.use(notFound);
app.use(errorHandler);

module.exports = app;
