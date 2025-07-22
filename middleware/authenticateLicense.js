import axios from 'axios';

export default async function authenticateLicense(req, res, next) {
  const licenseData = req.licenseData || req.query;
  const { auth, productId, hwid, source } = licenseData;

  // Fix: Use 'auth' instead of 'licenseKey' since that's what you're destructuring
  if (!auth || !productId || !hwid) {
    return res.status(400).json({ error: "License key, product ID, and HWID are required." });
  }

  try {
    const response = await axios.post(`https://license.euphoriadevelopment.uk/api/v1/validate`, {
      licenseKey: auth, // Fix: Use 'auth' here since that's the variable name
      productId,
      hwid,
    });

    if (response.data.status === 200) {
      return next(); // Proceed to serve the requested file
    } else {
      return res.status(403).json({ error: "Invalid License Key." });
    }
  } catch (error) {
    console.error('License validation error:', error.message); // Add logging for debugging
    return res.status(500).json({ error: "Error verifying License Key." });
  }
}