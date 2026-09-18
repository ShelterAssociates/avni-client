import * as turf from "@turf/turf";
import _ from "lodash";

export function hasStructures(geojson) {
    return !_.isEmpty(_.get(geojson, "features"));
}

export function hasBoundary(geojson) {
    return !_.isEmpty(_.get(geojson, "boundary.coordinates"));
}

function everything(geojson) {
    const features = hasStructures(geojson) ? geojson.features : [];
    const boundary = hasBoundary(geojson) ? [{type: "Feature", properties: {}, geometry: geojson.boundary}] : [];
    return {type: "FeatureCollection", features: [...features, ...boundary]};
}

// turf.bbox() of no coordinates is [Inf, Inf, -Inf, -Inf]: a NaN centre makes Leaflet throw and leaves the map grey.
export function mapCenter(geojson) {
    const all = everything(geojson);
    if (_.isEmpty(all.features)) return null;
    const bbox = turf.bbox(all);
    const center = {lat: (bbox[1] + bbox[3]) / 2, lng: (bbox[0] + bbox[2]) / 2};
    return _.every(center, _.isFinite) ? center : null;
}
