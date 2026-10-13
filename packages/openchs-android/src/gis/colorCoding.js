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

// Answer colours for the concept filters: 16 colours that stay distinguishable
// side by side on satellite imagery; a question with more answers wraps round.
export const ANSWER_PALETTE = [
    "#E74C3C", "#3498DB", "#2ECC71", "#F39C12", "#9B59B6", "#1ABC9C", "#E67E22", "#34495E",
    "#F1C40F", "#E91E63", "#00BCD4", "#8BC34A", "#795548", "#FF5722", "#3F51B5", "#607D8B",
];

// Answer polygons share one outline so the fill colour carries the meaning.
export const ANSWER_STYLE = {stroke: "#333333", fillOpacity: 0.75, weight: 1};

// Slum boundary: an unfilled dashed outline that stays visible over satellite imagery.
export const BOUNDARY_STYLE = {stroke: "#FFD400", weight: 3, dashArray: "8 6"};

// {answerLabel: colour} for the given labels. An answer the GIS metadata
// colours (presetColors, see filterColors.js) keeps the website's colour;
// the rest take palette colours in order. No two answers of one question share
// a colour until every palette colour is in use.
export function assignAnswerColors(labels, presetColors = {}) {
    const colors = {};
    const used = new Set();
    const isUsed = color => used.has(_.toLower(color));
    const take = color => { used.add(_.toLower(color)); return color; };
    const presetByLabel = _.mapKeys(presetColors, (color, label) => _.toLower(_.trim(label)));
    let next = 0;
    _.forEach(labels, label => {
        if (_.isNil(label) || _.has(colors, label)) return;
        const preset = presetByLabel[_.toLower(_.trim(label))];
        if (preset && !isUsed(preset)) {
            colors[label] = take(preset);
            return;
        }
        const free = _.find(ANSWER_PALETTE, color => !isUsed(color));
        colors[label] = free ? take(free) : ANSWER_PALETTE[next++ % ANSWER_PALETTE.length];
    });
    return colors;
}

// Structures with more than one household registered: stripes in these colours.
export const DUPLICATE_STRIPES = ["#d7263d", "#ffffff", "#f39c12"];

// Labels in a stable, meaningful order: the concept's own answer order
// first (so "Yes" is always the same colour across sessions and slums), then
// anything else — multi-select combinations, free text — as discovered.
export function orderAnswerLabels(discoveredLabels, conceptAnswerNames = []) {
    const discovered = _.uniq(_.filter(discoveredLabels, label => !_.isNil(label)));
    const known = _.filter(conceptAnswerNames, name => _.includes(discovered, name));
    return _.concat(known, _.difference(discovered, known));
}

// A category nothing is drawn in is left out: an empty row is a line of legend the map pays for
// and the worker cannot act on. A row counts are not supplied for is always kept.
function withCount(row, counts) {
    const count = counts[row.key];
    if (!_.isNumber(count)) return row;
    return count > 0 ? {...row, count} : null;
}

export function statusLegend({includeDuplicate = true, counts = {}} = {}) {
    const keys = ["notSurveyed", "registered", ...(includeDuplicate ? ["duplicate"] : []), "selected", "searchHit"];
    const rows = keys.map(key => ({key, label: STATUS_COLORS[key].label, color: STATUS_COLORS[key].fill, ...(key === "duplicate" && {stripes: DUPLICATE_STRIPES})}));
    return _.compact(rows.map(row => withCount(row, counts)));
}

// Legend for an active filter, derived from the exact colour map the map is
// using — there is no separate legend list to fall out of date. The two greys are listed with it
// so every colour on screen has a row: a household that did not answer, and an empty structure.
export function answerLegend(answerColors, counts = {}) {
    const answers = _.map(answerColors, (color, label) => ({key: label, label, color}));
    const greys = ["noData", "filteredOut"].map(key => ({key, label: STATUS_COLORS[key].label, color: STATUS_COLORS[key].fill}));
    // filteredOut is only meaningful once counted; without counts the legend keeps its old shape.
    const rows = _.concat(answers, _.isEmpty(counts) ? [greys[0]] : greys);
    return _.compact(rows.map(row => withCount(row, counts)));
}

// Label used by the built-in duplicate-registration filter.
export function duplicateLabel(count) {
    return `${count} registrations`;
}
