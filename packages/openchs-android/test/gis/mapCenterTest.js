import {assert} from "chai";
import {hasBoundary, hasStructures, mapCenter} from "../../src/gis/mapCenter";

const ring = (lng, lat, size) => [[[lng, lat], [lng + size, lat], [lng + size, lat + size], [lng, lat + size], [lng, lat]]];
const square = (lng, lat) => ({type: "Feature", properties: {s: "1"}, geometry: {type: "Polygon", coordinates: ring(lng, lat, 2)}});
const boundary = {type: "Polygon", coordinates: ring(70, 10, 10)};

describe("mapCenter", () => {
    it("is the middle of the bounding box of all structures", () => {
        const geojson = {type: "FeatureCollection", features: [square(73, 18), square(75, 20)]};
        assert.deepEqual(mapCenter(geojson), {lat: 20, lng: 75});
    });

    it("covers the boundary as well as the structures", () => {
        const geojson = {type: "FeatureCollection", boundary, features: [square(73, 18)]};
        assert.deepEqual(mapCenter(geojson), {lat: 15, lng: 75});
    });

    it("is the middle of the boundary when there are no structures yet", () => {
        assert.deepEqual(mapCenter({type: "FeatureCollection", boundary, features: []}), {lat: 15, lng: 75});
    });

    it("is null when the GIS server sent neither structures nor a boundary", () => {
        assert.isNull(mapCenter({type: "FeatureCollection", slum_name: "Kala Nagar", total: 0, features: []}));
        assert.isNull(mapCenter({type: "FeatureCollection", boundary: null, features: []}));
    });

    it("is null for anything that is not a feature collection", () => {
        assert.isNull(mapCenter(null));
        assert.isNull(mapCenter({}));
    });
});

describe("hasStructures / hasBoundary", () => {
    it("tell what the slum's GIS file contains", () => {
        const both = {type: "FeatureCollection", boundary, features: [square(73, 18)]};
        assert.isTrue(hasStructures(both));
        assert.isTrue(hasBoundary(both));
        const boundaryOnly = {type: "FeatureCollection", boundary, features: []};
        assert.isFalse(hasStructures(boundaryOnly));
        assert.isTrue(hasBoundary(boundaryOnly));
        const legacy = {type: "FeatureCollection", features: [square(73, 18)]};  // server without boundary support
        assert.isTrue(hasStructures(legacy));
        assert.isFalse(hasBoundary(legacy));
        assert.isFalse(hasBoundary({boundary: null}));
    });
});
