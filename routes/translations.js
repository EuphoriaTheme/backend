import express from 'express';
import path from 'path';
import fs from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import validateTranslationBody from '../middleware/validateTranslationBody.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const router = express.Router();

router.post('/translate/bulk', validateTranslationBody, async (req, res) => {
  const { texts, targetLang } = req.body;

  try {
    // Load the appropriate translation file
    const translationsPath = path.join(__dirname, `../public/translations/${targetLang}.json`);
    if (!fs.existsSync(translationsPath)) {
      return res.status(400).json({ success: false, error: `Translations for language "${targetLang}" are not available.` });
    }

    let translations;
    try {
      const fileContent = fs.readFileSync(translationsPath, 'utf8');
      translations = JSON.parse(fileContent);
    } catch (parseError) {
      console.error(`Error parsing translation file ${targetLang}.json:`, parseError);
      return res.status(500).json({ 
        success: false, 
        error: `Invalid JSON in translation file "${targetLang}.json". Please check the file for syntax errors.`,
        details: parseError.message 
      });
    }

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
          bg: 'Bulgarian',
          bn: 'Bengali',
          cs: 'Czech',
          da: 'Danish',
          de: 'German',
          en: 'English',
          el: 'Greek',
          es: 'Spanish',
          fa: 'Persian',
          fi: 'Finnish',
          fr: 'French',
          gr: 'Greek',
          he: 'Hebrew',
          hi: 'Hindi',
          hr: 'Croatian',
          hu: 'Hungarian',
          id: 'Indonesian',
          it: 'Italian',
          ja: 'Japanese',
          ko: 'Korean',
          ms: 'Malay',
          nl: 'Dutch',
          no: 'Norwegian',
          pl: 'Polish',
          pt: 'Portuguese',
          ro: 'Romanian',
          ru: 'Russian',
          sk: 'Slovak',
          sl: 'Slovenian',
          sr: 'Serbian',
          sv: 'Swedish',
          th: 'Thai',
          tr: 'Turkish',
          uk: 'Ukrainian',
          uwunese: 'Uwunese',
          vn: 'Vietnamese',
          zh: 'Chinese',
          zh_tw: 'Chinese (Traditional)'
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
