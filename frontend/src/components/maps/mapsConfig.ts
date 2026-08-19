// @react-google-maps/api's useJsApiLoader keys a single global script loader by `id`.
// Every component that shares that id MUST request the exact same options (including
// `libraries`, by reference) or the library throws "Loader must not be called again
// with different options" the moment a second component mounts with a different config
// in the same session (e.g. navigating from a cafe detail page to an edit/onboarding
// flow without a full page reload).
export const GOOGLE_MAPS_SCRIPT_ID = 'google-map-script';
export const GOOGLE_MAPS_LIBRARIES: ('places' | 'drawing' | 'geometry' | 'visualization')[] = ['places'];
