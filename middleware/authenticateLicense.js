const axios = require('axios');

async function authenticateLicense(req, res, next) {
  const { auth: licenseKey, productId, hwid, source } = req.query;

  // Validate input
  if (!licenseKey || !productId || !hwid) {
    return res.status(400).json({ error: "License key, product ID, and HWID are required." });
  }

  try {
    const response = await axios.post(`https://license.euphoriadevelopment.uk/api/v1/validate`, {
      licenseKey,
      productId,
      hwid,
    });

    if (response.data.status === 200) {
      return next(); // Proceed to serve the requested file
    } else {
      return res.status(403).json({ error: "Invalid License Key." });
    }
  } catch (error) {
    return res.status(500).json({ error: "Error verifying License Key." });
  }
}

module.exports = authenticateLicense;