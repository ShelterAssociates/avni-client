import RNFS from "react-native-fs";
import _ from "lodash";

export const REGISTRATION_FORMS_FILE = `${RNFS.DocumentDirectoryPath}/gis/map_registration_subject_types.json`;

let cached = null;

export async function saveMapRegistrationSubjectTypes(names) {
    cached = _.isArray(names) ? names : [];
    await RNFS.writeFile(REGISTRATION_FORMS_FILE, JSON.stringify(cached), "utf8");
}

export async function loadMapRegistrationSubjectTypes() {
    if (!_.isNil(cached)) return cached;
    cached = (await RNFS.exists(REGISTRATION_FORMS_FILE))
        ? JSON.parse(await RNFS.readFile(REGISTRATION_FORMS_FILE, "utf8"))
        : [];
    return cached;
}

// None chosen on the GIS server means the map stays in front of every registration, as before.
export function registrationUsesMap(subjectTypeName, chosenNames) {
    return _.isEmpty(chosenNames) || _.includes(chosenNames, subjectTypeName);
}

export function mapRegistrationSubjectTypes() {
    return cached;
}

// Renders ask synchronously but the list lives on disk, so load it once and let the caller redraw.
let loading = false;

export function ensureMapRegistrationSubjectTypes(onLoaded) {
    if (loading || !_.isNil(cached)) return;
    loading = true;
    loadMapRegistrationSubjectTypes().then(() => {
        loading = false;
        onLoaded();
    });
}

export function choicesUsingMap(choices) {
    return _.filter(choices, choice => registrationUsesMap(_.get(choice, "subjectType.name"), cached));
}
