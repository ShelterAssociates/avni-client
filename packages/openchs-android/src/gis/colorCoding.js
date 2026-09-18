// Every colour drawn on the GIS map, in one place.
//
// MapPickerScreen renders the legend from these and injects them into the
// Leaflet page as data, so the polygon styles inside the WebView and the
// legend outside it can never disagree. Pure functions only; no React, no
// Realm — safe to unit test and to reuse elsewhere.
import _ from "lodash";

// Survey-status layer. `fill`/`stroke` are the polygon colours, `label` is
// what the legend shows.
export const STATUS_COLORS = {
    notSurveyed: {fill: "#63991a", stroke: "#2d6a0e", fillOpacity: 0.4, weight: 1, label: "Not surveyed"},
    registered: {fill: "#ff8c00", stroke: "#cc5500", fillOpacity: 0.7, weight: 1, label: "Registered"},
    duplicate: {fill: "#d7263d", stroke: "#8e1b2a", fillOpacity: 0.8, weight: 2, label: "Registered more than once"},
    selected: {fill: "#378ADD", stroke: "#005BB5", fillOpacity: 0.9, weight: 3, label: "Selected"},
    searchHit: {fill: "#9B59B6", stroke: "#6C3483", fillOpacity: 0.9, weight: 3, label: "Search result"},
    // A household with no answer for the active filter.
    noData: {fill: "#bbbbbb", stroke: "#888888", fillOpacity: 0.25, weight: 1, label: "No data"},
    // A structure with nobody registered while a filter is active.
    filteredOut: {fill: "#bbbbbb", stroke: "#888888", fillOpacity: 0.15, weight: 1, label: "Not surveyed"},
};

// Answer colours for the concept filters, assigned in the order answers are
// listed (see assignAnswerColors) and wrapping round past the end.
export const ANSWER_PALETTE = [
    "#E74C3C", "#3498DB", "#2ECC71", "#F39C12", "#9B59B6", "#1ABC9C",
    "#E67E22", "#C0392B", "#2980B9", "#27AE60", "#D35400", "#8E44AD",
];

// Answer polygons share one outline so the fill colour carries the meaning.
export const ANSWER_STYLE = {stroke: "#333333", fillOpacity: 0.75, weight: 1};

// {answerLabel: colour} for the given labels, first label gets the first
// palette colour, and so on round the palette. Duplicate labels keep their
// first colour.
export function assignAnswerColors(labels) {
    const colors = {};
    let next = 0;
    _.forEach(labels, label => {
        if (_.isNil(label) || _.has(colors, label)) return;
        colors[label] = ANSWER_PALETTE[next % ANSWER_PALETTE.length];
        next++;
    });
    return colors;
}

// Labels in a stable, meaningful order: the concept's own answer order
// first (so "Yes" is always the same colour across sessions and slums), then
// anything else — multi-select combinations, free text — as discovered.
export function orderAnswerLabels(discoveredLabels, conceptAnswerNames = []) {
    const discovered = _.uniq(_.filter(discoveredLabels, label => !_.isNil(label)));
    const known = _.filter(conceptAnswerNames, name => _.includes(discovered, name));
    return _.concat(known, _.difference(discovered, known));
}

export function statusLegend({includeDuplicate = true} = {}) {
    const keys = ["notSurveyed", "registered", ...(includeDuplicate ? ["duplicate"] : []), "selected", "searchHit"];
    return keys.map(key => ({key, label: STATUS_COLORS[key].label, color: STATUS_COLORS[key].fill}));
}

// Legend for an active filter, derived from the exact colour map the map is
// using — there is no separate legend list to fall out of date.
export function answerLegend(answerColors) {
    const rows = _.map(answerColors, (color, label) => ({key: label, label, color}));
    return _.concat(rows, [{key: "noData", label: STATUS_COLORS.noData.label, color: STATUS_COLORS.noData.fill}]);
}

// Label used by the built-in duplicate-registration filter.
export function duplicateLabel(count) {
    return `${count} registrations`;
}
