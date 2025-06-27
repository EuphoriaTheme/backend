import express from 'express';
import path from 'path';
import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

router.post('/translate/bulk', async (req, res) => {
  const { texts, targetLang } = req.body;

  // Validate required fields
  if (!texts || !Array.isArray(texts) || texts.length === 0 || !targetLang) {
    return res.status(400).json({ success: false, error: 'Texts and target language are required.' });
  }

      try {
        // Load the appropriate translation file
        const translationsPath = path.join(__dirname, `../public/translations/${targetLang}.json`);
        if (!fs.existsSync(translationsPath)) {
          return res.status(400).json({ success: false, error: `Translations for language "${targetLang}" are not available.` });
        }

        const translations = JSON.parse(fs.readFileSync(translationsPath, 'utf8'));

        // Translate each text in the array
        const translationsResult = {};
        for (const text of texts) {
          if (text.trim() !== '') {
            translationsResult[text] = translations[text] || text; // Return the original text if translation is missing
          }
        }

        res.json({ success: true, translations: translationsResult });
      } catch (error) {
        console.error('Error translating texts:', error);
        res.status(500).json({ success: false, error: 'Failed to translate texts.' });
      }
});

router.get('/', async (req, res) => {
  try {
    // Fetch the list of available translations
    const translationsDir = path.join(__dirname, '../public/translations');
    const availableTranslations = fs.readdirSync(translationsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        const code = file.replace('.json', ''); // Remove the .json extension
        const readableNames = {
          ar: 'Arabic',
          zh: 'Chinese',
          zh_tw: 'Chinese (Traditional)',
          nl: 'Dutch',
          en: 'English',
          fr: 'French',
          gr: 'Greek',
          id: 'Indonesian',
          de: 'German',
          it: 'Italian',
          ja: 'Japanese',
		  ko: 'Korean',
          pt: 'Portuguese',
          ru: 'Russian',
          es: 'Spanish',
          tr: 'Turkish',
          vn: 'Vietnamese',
        };
        return { code, name: readableNames[code] || code }; // Default to code if name is not found
      });

    res.json({ success: true, languages: availableTranslations });
  } catch (error) {
    console.error('Error fetching available translations:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch available translations.' });
  }
});

export default router;
