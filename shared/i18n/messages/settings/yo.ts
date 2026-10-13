// Draft: needs native-speaker review
import type en from "./en.ts";

const yo: Partial<Record<keyof typeof en, string>> = {
  "language.title": "Èdè",
  "language.sub": "Èdè tí Shopinbos yóò máa lò fún menu àti bọ́tìnnì. O lè yí i padà nígbàkúùgbà.",
  "language.choose": "Yan èdè rẹ",
  "language.current": "Èdè tí o ń lò báyìí: {language}",
  "language.button": "Èdè: {language}",
  "language.changed": "Shopinbos ti ń sọ {language} báyìí.",
  "language.draftNote": "Ìtúmọ̀ yìí ṣì tuntun: àwọn ojú-ewé kan ṣì wà ní English. Sọ fún wa tí ọ̀rọ̀ kan kò bá dún dáadáa.",
  "language.onboarding": "Rex àti app yìí yóò máa lo èdè yìí. O lè yí i padà nígbàkúùgbà nínú Ètò.",
  "language.saving": "À ń yí èdè padà…",
  "language.offline": "A ti fi pamọ́ sórí fóònù yìí. A ó fi pamọ́ sí àkáǹtì rẹ nígbà tí network bá padà.",
};

export default yo;
