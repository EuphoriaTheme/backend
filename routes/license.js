import express from 'express';
import LicenseKey from '../models/LicenseKey.js';
import { authenticateLicense } from '../middleware/auth.js';

const router = express.Router();

router.post('/link', authenticateLicense, async (req, res) => {
  const { key } = req.body;
  const license = await LicenseKey.findOne({ key, isActive: true });
  if (!license) return res.status(400).json({ error: 'Invalid license' });
  license.user = req.user._id;
  await license.save();
  await User.updateOne({ discordId: req.user.id }, { licenseKey: key });
  res.json({ success: true });
});

export default router;
