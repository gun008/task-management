import jwt from 'jsonwebtoken';
import { User } from './models.js';

export function issueToken(user) { return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' }); }
export async function requireAuth(req, res, next) {
  try { const token = req.headers.authorization?.replace('Bearer ', ''); if (!token) return res.status(401).json({ message: 'Authentication required' }); const payload = jwt.verify(token, process.env.JWT_SECRET); req.user = await User.findById(payload.id); if (!req.user?.isActive) return res.status(401).json({ message: 'Account is inactive' }); next(); } catch { res.status(401).json({ message: 'Invalid or expired session' }); }
}