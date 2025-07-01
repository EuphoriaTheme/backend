// middleware/validateTranslationBody.js
export default function validateTranslationBody(req, res, next) {
  const { texts, targetLang } = req.body;
  if (!texts || !Array.isArray(texts) || texts.length === 0 || !targetLang) {
    return res.status(400).json({ success: false, error: 'Texts and target language are required.' });
  }
  next();
}
