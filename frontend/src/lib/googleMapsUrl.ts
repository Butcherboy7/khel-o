// Mirrors the backend allow-list in backend/app/constants.py::validate_google_maps_url
// — this is just for fast client-side feedback, the server still validates.
export const GOOGLE_MAPS_URL_PATTERN =
  /^https?:\/\/(maps\.app\.goo\.gl\/|goo\.gl\/maps\/|(www\.)?google\.com\/maps|(www\.)?maps\.google\.com\/maps)/i;
