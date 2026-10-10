export interface WestAfricaCountry {
  name: string;
  code: string;
  currency: string;
  regions: string[];
}

export const westAfricaCountries: WestAfricaCountry[] = [
  {
    name: "Nigeria",
    code: "NG",
    currency: "NGN",
    regions: [
      "Lagos", "Abuja FCT", "Rivers", "Oyo", "Kano", "Kaduna", "Ogun",
      "Delta", "Edo", "Enugu", "Anambra", "Kwara", "Plateau", "Nasarawa",
      "Benue", "Cross River", "Akwa Ibom", "Imo", "Abia", "Ondo", "Osun",
      "Ekiti", "Bayelsa", "Ebonyi", "Kogi", "Niger", "Sokoto", "Katsina",
      "Jigawa", "Yobe", "Borno", "Adamawa", "Bauchi", "Gombe", "Taraba",
      "Zamfara", "Kebbi",
    ],
  },
  {
    name: "Ghana",
    code: "GH",
    currency: "GHS",
    regions: [
      "Greater Accra", "Ashanti", "Western", "Eastern", "Central",
      "Volta", "Northern", "Upper East", "Upper West", "Bono",
      "Ahafo", "Bono East", "North East", "Savannah", "Oti", "Western North",
    ],
  },
  {
    name: "Côte d'Ivoire",
    code: "CI",
    currency: "XOF",
    regions: [
      "Abidjan", "Bas-Sassandra", "Comoé", "Denguélé", "Gôh-Djiboua",
      "Lacs", "Lagunes", "Montagnes", "Sassandra-Marahoué", "Savanes",
      "Vallée du Bandama", "Woroba", "Yamoussoukro", "Zanzan",
    ],
  },
  {
    name: "Senegal",
    code: "SN",
    currency: "XOF",
    regions: [
      "Dakar", "Thiès", "Saint-Louis", "Kaolack", "Ziguinchor",
      "Diourbel", "Fatick", "Louga", "Tambacounda", "Kolda",
      "Matam", "Kaffrine", "Kédougou", "Sédhiou",
    ],
  },
  {
    name: "Mali",
    code: "ML",
    currency: "XOF",
    regions: [
      "Bamako", "Gao", "Kayes", "Kidal", "Koulikoro", "Mopti",
      "Ségou", "Sikasso", "Taoudénit", "Ménaka",
    ],
  },
  {
    name: "Burkina Faso",
    code: "BF",
    currency: "XOF",
    regions: [
      "Centre", "Boucle du Mouhoun", "Cascades", "Centre-Est",
      "Centre-Nord", "Centre-Ouest", "Centre-Sud", "Est",
      "Hauts-Bassins", "Nord", "Plateau-Central", "Sahel", "Sud-Ouest",
    ],
  },
  {
    name: "Niger",
    code: "NE",
    currency: "XOF",
    regions: [
      "Niamey", "Agadez", "Diffa", "Dosso", "Maradi",
      "Tahoua", "Tillabéri", "Zinder",
    ],
  },
  {
    name: "Benin",
    code: "BJ",
    currency: "XOF",
    regions: [
      "Alibori", "Atakora", "Atlantique", "Borgou", "Collines",
      "Donga", "Kouffou", "Littoral", "Mono", "Ouémé",
      "Plateau", "Zou",
    ],
  },
  {
    name: "Togo",
    code: "TG",
    currency: "XOF",
    regions: [
      "Maritime", "Plateaux", "Centrale", "Kara", "Savanes",
    ],
  },
  {
    name: "Sierra Leone",
    code: "SL",
    currency: "SLL",
    regions: [
      "Western Area", "Eastern", "Northern", "North West", "Southern",
    ],
  },
  {
    name: "Guinea",
    code: "GN",
    currency: "GNF",
    regions: [
      "Conakry", "Boké", "Faranah", "Kankan", "Kindia",
      "Labé", "Mamou", "Nzérékoré",
    ],
  },
  {
    name: "Guinea-Bissau",
    code: "GW",
    currency: "XOF",
    regions: [
      "Bissau", "Bafatá", "Biombo", "Bolama", "Cacheu",
      "Gabú", "Oio", "Quinara", "Tombali",
    ],
  },
  {
    name: "Liberia",
    code: "LR",
    currency: "LRD",
    regions: [
      "Montserrado", "Margibi", "Bong", "Nimba", "Lofa",
      "Grand Gedeh", "Grand Bassa", "Grand Cape Mount", "Gbarpolu",
      "River Gee", "Rivercess", "Sinoe", "Maryland", "Grand Kru", "Bomi",
    ],
  },
  {
    name: "Gambia",
    code: "GM",
    currency: "GMD",
    regions: [
      "Banjul", "Kanifing", "Brikama", "Mansa Konko", "Kerewan",
      "Kuntaur", "Janjanbureh", "Basse",
    ],
  },
  {
    name: "Cape Verde",
    code: "CV",
    currency: "CVE",
    regions: [
      "Santiago", "São Vicente", "Santo Antão", "Fogo", "Sal",
      "Boavista", "Maio", "Brava", "São Nicolau",
    ],
  },
  {
    name: "Mauritania",
    code: "MR",
    currency: "MRU",
    regions: [
      "Nouakchott", "Adrar", "Assaba", "Brakna", "Dakhlet Nouadhibou",
      "Gorgol", "Guidimaka", "Hodh Ech Chargui", "Hodh El Gharbi",
      "Inchiri", "Tagant", "Tiris Zemmour", "Trarza",
    ],
  },
];

export type DeliveryScope = "intrastate" | "interstate" | "cross_country" | "regional";

export const deliveryScopeOptions: { value: DeliveryScope; label: string; description: string }[] = [
  { value: "intrastate", label: "Intrastate", description: "Within the same state or region" },
  { value: "interstate", label: "Interstate", description: "Between states in the same country" },
  { value: "cross_country", label: "Cross-country", description: "Between different countries" },
  { value: "regional", label: "Regional", description: "Custom area within a region" },
];
