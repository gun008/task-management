import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Activity, Task, User } from './models.js';
import { issueToken, requireAuth } from './auth.js';

const app = express();
app.use(cors({
    alllowOrigin: '*',
}));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'taskflow-api' }));
app.post('/api/auth/register', async (req, res) => { try { const { name, email, password } = req.body; if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required' }); const exists = await User.findOne({ email }); if (exists) return res.status(409).json({ message: 'Email is already registered' }); const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) }); res.status(201).json({ token: issueToken(user), user: { id: user._id, name: user.name, email: user.email, role: user.role } }); } catch (error) { res.status(500).json({ message: 'Unable to register account' }); } });
app.post('/api/auth/login', async (req, res) => { const user = await User.findOne({ email: req.body.email }); if (!user || !user.isActive || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) return res.status(401).json({ message: 'Invalid email or password' }); res.json({ token: issueToken(user), user: { id: user._id, name: user.name, email: user.email, role: user.role } }); });
app.get('/api/tasks', requireAuth, async (req, res) => { const query = req.user.role === 'Admin' ? {} : { $or: [{ assignedTo: req.user._id }, { assignedBy: req.user._id }] }; res.json(await Task.find(query).populate('assignedTo assignedBy', 'name email').sort({ dueDate: 1 })); });
app.post('/api/tasks', requireAuth, async (req, res) => { if (!['Admin', 'Manager'].includes(req.user.role)) return res.status(403).json({ message: 'Only admins and managers can create tasks' }); const assignee = await User.findOne({ _id: req.body.assignedTo, isActive: true }); if (!assignee) return res.status(400).json({ message: 'Assigned user must be active' }); const task = await Task.create({ ...req.body, assignedBy: req.user._id, assignedTo: assignee._id }); await Activity.create({ taskId: task._id, userId: req.user._id, action: 'Task created' }); res.status(201).json(task); });
app.patch('/api/tasks/:id', requireAuth, async (req, res) => { const task = await Task.findById(req.params.id); if (!task) return res.status(404).json({ message: 'Task not found' }); const canEdit = req.user.role === 'Admin' || task.assignedBy.equals(req.user._id); const statusOnly = Object.keys(req.body).every((key) => ['status', 'progress'].includes(key)); if (!canEdit && !(task.assignedTo.equals(req.user._id) && statusOnly)) return res.status(403).json({ message: 'You cannot edit this task' }); const oldStatus = task.status; Object.assign(task, req.body); if (task.status === 'Completed') { task.progress = 100; task.completedAt ||= new Date(); } await task.save(); if (oldStatus !== task.status) await Activity.create({ taskId: task._id, userId: req.user._id, action: 'Status changed', field: 'status', oldValue: oldStatus, newValue: task.status }); res.json(task); });
app.get('/api/tasks/:id/activity', requireAuth, async (req, res) => { const task = await Task.findById(req.params.id); if (!task) return res.status(404).json({ message: 'Task not found' }); const allowed = req.user.role === 'Admin' || task.assignedBy.equals(req.user._id) || task.assignedTo.equals(req.user._id); if (!allowed) return res.status(403).json({ message: 'Access denied' }); res.json(await Activity.find({ taskId: task._id }).populate('userId', 'name').sort({ createdAt: -1 })); });

const port = process.env.PORT || 5000;
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/taskflow').then(() => app.listen(port, () => console.log(`TaskFlow API listening on ${port}`))).catch((error) => { console.error('MongoDB connection failed:', error.message); process.exit(1); });