const express = require('express');
const router = express.Router();
const authenticateLicense = require('../middleware/authenticateLicense');
require('dotenv').config();

router.post('/verify-license', async (req, res, next) => {
  const { licenseKey, productId, hwid, source } = req.body;

  if (!licenseKey || !productId || !hwid) {
    return res.status(400).json({ success: false, error: "License key, product ID, and HWID are required." });
  }

  // Use the authenticateLicense middleware to validate the license
  req.query = { auth: licenseKey, productId, hwid, source }; // Populate `req.query` for the middleware
  authenticateLicense(req, res, () => {
    // If the license is valid, send a success response
    res.json({ success: true, message: "License is valid." });
  });
});

export default router;