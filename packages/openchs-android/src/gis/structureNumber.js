// House / structure numbers reach the map in several spellings: the GIS
// server's Component.housenumber ("35", "22A"), Avni's Individual.firstName
// ("0035" — zero-padded to 4 digits by the registration form), and whatever a
// worker types in the search box. structureKey() reduces all of them to one
// canonical form so every lookup on both sides of the WebView bridge agrees.
//
// This function is also serialised with toString() into the Leaflet page
// (see MapPickerScreen.buildMapHTML), so keep it self-contained ES5: no
// imports, no arrow functions, no template literals, no helpers.

export function structureKey(value) {
    if (value === null || value === undefined) return "";
    var text = String(value).trim();
    if (text === "") return "";
    var match = /^0*(\d+)(.*)$/.exec(text);
    if (!match) return text;
    return match[1] + match[2].trim();
}

// Source of structureKey for the WebView, with the export wrapper stripped so
// it can be pasted into a <script> as a plain function declaration.
export const STRUCTURE_KEY_SOURCE = structureKey.toString();

export function isBlankStructure(value) {
    return structureKey(value) === "";
}
