import * as Localization from 'expo-localization';
import { I18n } from 'i18n-js';

// Import translation files
import en from './en.json';
import es from './es.json';
import fr from './fr.json';
import de from './de.json';
import it from './it.json';
import ja from './ja.json';
import zh from './zh.json';
import id from './id.json';
import pt from './pt.json';
import ru from './ru.json';
import ko from './ko.json';
import ar from './ar.json';
import hi from './hi.json';
import tl from './tl.json';
import th from './th.json';
import vi from './vi.json';
import tr from './tr.json';

// Set up i18n instance
const i18n = new I18n({
  en,
  es,
  fr,
  de,
  it,
  ja,
  zh,
  id,
  pt,
  ru,
  ko,
  ar,
  hi,
  tl,
  th,
  vi,
  tr,
});

// Set the locale once at the beginning of your app.
i18n.locale = Localization.getLocales()[0]?.languageTag || 'en';

// When a value is missing from a language it'll fallback to another language with the key present.
i18n.enableFallback = true;
// To see the fallback mechanism uncomment the line below to force the app to use French
// i18n.locale = 'fr'; 

// Function to change the locale (useful if you want a language switcher)
export const setLocale = (locale: string) => {
  i18n.locale = locale;
};

// Export the configured i18n instance
export default i18n; 