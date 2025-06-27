async function validateGameRequest(req, res, next) {
    const { game, ip, port } = req.params;
  
    if (!game || !ip || !port) {
      return res.status(400).json({ success: false, error: 'Invalid parameters' });
    }
  
    next(); // Proceed to the next middleware or route handler
  }