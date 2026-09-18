import {hasBoundary, hasStructures} from "./mapCenter";

// A slum the server temporarily answers with nothing must not wipe the houses the phone already has.
export function keepsMoreMapData(previous, next) {
    if (!previous || typeof previous !== "object") return true;
    return (hasStructures(next) || !hasStructures(previous)) && (hasBoundary(next) || !hasBoundary(previous));
}
