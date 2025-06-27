export async function authenticateLicense(req, res, next) {
  const { auth: licenseKey, productId, hwid } = req.query;

  // Validate input
  if (!licenseKey || !productId || !hwid) {
    return res.status(400).json({ error: "License key, product ID, and HWID are required." });
  }

  try {
    // Call the license API to validate the license key
    const response = await axios.post(`https://license.euphoriadevelopment.uk/api/v1/validate`, {
      licenseKey,
      productId,
      hwid,
    });

    return next(); // Proceed to serve the requested file

  } catch (error) {
    return res.status(500).json({ error: "Error verifying License Key." });
  }
}