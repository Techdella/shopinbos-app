const PUBLIC_API_ALLOWED_ORIGINS = [
  "https://shopinbos.com",
  "https://www.shopinbos.com",
  "http://localhost:3000",
  "http://localhost:8080",
];

const PUBLIC_API_ALLOWED_METHODS = ["GET", "OPTIONS"];
const PUBLIC_API_ALLOWED_HEADERS = ["Content-Type"];
const PUBLIC_API_BASE_PATH = "/api/v1/public";
const PUBLIC_API_LEGACY_BASE_PATH = "/api/public";
const PUBLIC_LIST_CACHE = "public, max-age=300, stale-while-revalidate=600";
const PUBLIC_DETAIL_CACHE = "public, max-age=600, stale-while-revalidate=1200";

module.exports = {
  PUBLIC_API_ALLOWED_ORIGINS,
  PUBLIC_API_ALLOWED_METHODS,
  PUBLIC_API_ALLOWED_HEADERS,
  PUBLIC_API_BASE_PATH,
  PUBLIC_API_LEGACY_BASE_PATH,
  PUBLIC_LIST_CACHE,
  PUBLIC_DETAIL_CACHE,
};
