import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// Kalitlar — o'zbekcha matnning o'zi (tarjima bo'lmasa kalit ko'rsatiladi). ru/en fayllari keyin qo'shiladi.
void i18n.use(initReactI18next).init({
  lng: 'uz',
  fallbackLng: 'uz',
  resources: { uz: { translation: {} } },
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  returnEmptyString: false,
});

export default i18n;
