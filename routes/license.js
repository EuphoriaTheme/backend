import express from 'express';
const router = express.Router();
import authenticateLicense from '../middleware/authenticateLicense.js';

router.post('/verify-license', async (req, res, next) => {
  // Check if req.body exists
  if (!req.body) {
    return res.status(400).json({ success: false, error: "Request body is required." });
  }

  const { licenseKey, productId, hwid, source } = req.body;

  if (!licenseKey || !productId || !hwid) {
    return res.status(400).json({ success: false, error: "License key, product ID, and HWID are required." });
  }

  // Store license data in a custom property
  req.licenseData = { auth: licenseKey, productId, hwid, source };

  // Use the authenticateLicense middleware
  authenticateLicense(req, res, (err) => {
    if (err) {
      return res.status(401).json({ success: false, error: "License verification failed." });
    }
    // If the license is valid, send a success response
    res.json({ success: true, message: "License is valid." });
  });
});

export default router;