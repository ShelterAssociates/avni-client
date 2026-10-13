// The latest sync always wins: a slum's structures, numbers and footprints all change on the
// website, so whatever the newest successful download says replaces the saved copy. The only
// payload worth refusing is one that is not a slum file at all - an error page or a proxy's
// JSON would otherwise wipe good structures.
export function isStructureCollection(payload) {
    return !!payload && payload.type === "FeatureCollection" && Array.isArray(payload.features);
}

export function slumFileName(avniUuid) {
    return `structures_${avniUuid}.json`;
}
