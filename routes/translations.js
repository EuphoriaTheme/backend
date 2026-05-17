import path from "path";
import fs from "fs";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAX_TRANSLATION_ITEMS = Number.parseInt(
  process.env.MAX_TRANSLATION_ITEMS || "250",
  10,
);
const MAX_TRANSLATION_TEXT_LENGTH = Number.parseInt(
  process.env.MAX_TRANSLATION_TEXT_LENGTH || "256",
  10,
);
const LANGUAGE_LIST_CACHE_TTL_MS = Number.parseInt(
  process.env.LANGUAGE_LIST_CACHE_TTL_MS || "30000",
  10,
);

const translationCache = new Map();
let languagesCache = null;
let languagesCacheExpiresAt = 0;

function isValidLanguageCode(code) {
  return typeof code === "string" && /^[a-z_]{2,12}$/i.test(code);
}

function getTranslationFilePath(targetLang) {
  return path.join(__dirname, `../public/translations/${targetLang}.json`);
}

function getCachedTranslationMap(targetLang) {
  const filePath = getTranslationFilePath(targetLang);
  if (!fs.existsSync(filePath)) {
    return {
      error: `Translations for language "${targetLang}" are not available.`,
      statusCode: 400,
    };
  }

  const stat = fs.statSync(filePath);
  const cached = translationCache.get(targetLang);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return { data: cached.data };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    translationCache.set(targetLang, { data: parsed, mtimeMs: stat.mtimeMs });
    return { data: parsed };
  } catch (parseError) {
    return {
      error: `Invalid JSON in translation file "${targetLang}.json". Please check the file for syntax errors.`,
      statusCode: 500,
      details: parseError.message,
    };
  }
}

function getCachedLanguagesList() {
  const now = Date.now();
  if (languagesCache && now < languagesCacheExpiresAt) {
    return languagesCache;
  }

  const translationsDir = path.join(__dirname, "../public/translations");
  const availableTranslations = fs
    .readdirSync(translationsDir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const code = file.replace(".json", "");
      return { code, name: readableNames[code] || code };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  languagesCache = availableTranslations;
  languagesCacheExpiresAt = now + LANGUAGE_LIST_CACHE_TTL_MS;
  return availableTranslations;
}

const readableNames = {
  ar: "Arabic",
  bg: "Bulgarian",
  bn: "Bengali",
  cs: "Czech",
  da: "Danish",
  de: "German",
  en: "English",
  el: "Greek",
  es: "Spanish",
  fa: "Persian",
  fi: "Finnish",
  fr: "French",
  gr: "Greek",
  he: "Hebrew",
  hi: "Hindi",
  hr: "Croatian",
  hu: "Hungarian",
  id: "Indonesian",
  it: "Italian",
  ja: "Japanese",
  ko: "Korean",
  ms: "Malay",
  nl: "Dutch",
  no: "Norwegian",
  pl: "Polish",
  pt: "Portuguese",
  ro: "Romanian",
  ru: "Russian",
  sk: "Slovak",
  sl: "Slovenian",
  sr: "Serbian",
  sv: "Swedish",
  th: "Thai",
  tr: "Turkish",
  uk: "Ukrainian",
  uwunese: "Uwunese",
  vn: "Vietnamese",
  zh: "Chinese",
  zh_tw: "Chinese (Traditional)",
};

export default async function registerTranslationsRoutes(app) {
  app.post("/translate/bulk", async (request, reply) => {
    const { texts, targetLang } = request.body || {};

    if (!texts || !Array.isArray(texts) || texts.length === 0 || !targetLang) {
      return reply.code(400).send({
        success: false,
        error: "Texts and target language are required.",
      });
    }

    if (!isValidLanguageCode(targetLang)) {
      return reply.code(400).send({
        success: false,
        error: "targetLang contains invalid characters.",
      });
    }

    if (texts.length > MAX_TRANSLATION_ITEMS) {
      return reply.code(413).send({
        success: false,
        error: `Maximum ${MAX_TRANSLATION_ITEMS} texts per request.`,
      });
    }

    for (const text of texts) {
      if (typeof text !== "string") {
        return reply
          .code(400)
          .send({ success: false, error: "Each text item must be a string." });
      }

      if (text.length > MAX_TRANSLATION_TEXT_LENGTH) {
        return reply.code(413).send({
          success: false,
          error: `Each text item must be <= ${MAX_TRANSLATION_TEXT_LENGTH} characters.`,
        });
      }
    }

    try {
      const translationResult = getCachedTranslationMap(targetLang);
      if (translationResult.error) {
        return reply.code(translationResult.statusCode || 500).send({
          success: false,
          error: translationResult.error,
          details: translationResult.details,
        });
      }

      const translations = translationResult.data;

      const translationsResult = {};
      for (const text of texts) {
        if (String(text || "").trim() !== "") {
          translationsResult[text] = translations[text] || text;
        }
      }

      return { success: true, translations: translationsResult };
    } catch (error) {
      console.error("Error translating texts:", error);
      return reply
        .code(500)
        .send({ success: false, error: "Failed to translate texts." });
    }
  });

  const handleLanguagesRequest = async (request, reply) => {
    try {
      const availableTranslations = getCachedLanguagesList();

      return { success: true, languages: availableTranslations };
    } catch (error) {
      console.error("Error fetching available translations:", error);
      return reply.code(500).send({
        success: false,
        error: "Failed to fetch available translations.",
      });
    }
  };

  app.get("/", handleLanguagesRequest);
  app.get("/index", handleLanguagesRequest);
}
