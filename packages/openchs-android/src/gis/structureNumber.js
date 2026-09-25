// House / structure numbers reach the map in several spellings: the GIS
// server's Component.housenumber ("35", "22A"), Avni's Individual.firstName
// ("0035" — zero-padded to 4 digits by the registration form), and whatever a
// worker types in the search box. structureKey() reduces all of them to one
// canonical form so every lookup on both sides of the WebView bridge agrees.
//
// Pasted into the Leaflet page as a string: Hermes stringifies functions as "{ [bytecode] }", so
// structureKey.toString() cannot be used. Keep it ES5 and identical to structureKey below (tested).
export const STRUCTURE_KEY_SOURCE = `function structureKey(value) {
    if (value === null || value === undefined) return "";
    var text = String(value).trim();
    if (text === "") return "";
    var match = /^0*(\\d+)(.*)$/.exec(text);
    if (!match) return text;
    return match[1] + match[2].trim();
}`;

export function structureKey(value) {
    if (value === null || value === undefined) return "";
    var text = String(value).trim();
    if (text === "") return "";
    var match = /^0*(\d+)(.*)$/.exec(text);
    if (!match) return text;
    return match[1] + match[2].trim();
}

export function isBlankStructure(value) {
    return structureKey(value) === "";
}

// Avni stores house numbers zero-padded to 4 digits; the GIS server's are unpadded ("35", "22A").
export function formatHouseholdNumber(value) {
    if (value === null || value === undefined) return "";
    const text = String(value).trim();
    if (text === "") return "";
    const match = /^(\d+)(.*)$/.exec(text);
    if (!match) return text;
    const digits = match[1].padStart(4, "0");
    const suffix = match[2].trim();
    return digits + suffix;
}
