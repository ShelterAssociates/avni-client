import _ from "lodash";
import {structureKey} from "./structureNumber";

export const EXTRA_BLANK = "blank";
export const EXTRA_ON_MAP = "onMap";
export const EXTRA_TAKEN = "taken";

// Households of this slum whose number matches no structure, so the map can never show them.
export function extraHouseholds(statusMap, keysOnMap) {
    const onMap = new Set(keysOnMap);
    return _(statusMap)
        .map((entry, key) => ({key, ...entry}))
        .reject(({key}) => onMap.has(key))
        .sortBy(({key}) => _.padStart(key, 12, "0"))
        .value();
}

export function validateExtraHouse(value, statusMap, keysOnMap) {
    const key = structureKey(value);
    if (key === "") return {ok: false, reason: EXTRA_BLANK};
    if (_.includes(keysOnMap, key)) return {ok: false, reason: EXTRA_ON_MAP};
    if (!_.isNil(_.get(statusMap, key))) return {ok: false, reason: EXTRA_TAKEN};
    return {ok: true, key};
}
