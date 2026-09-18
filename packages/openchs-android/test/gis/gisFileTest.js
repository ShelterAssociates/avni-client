import {assert} from "chai";
import {keepsMoreMapData} from "../../src/gis/gisFile";

const withHouses = {type: "FeatureCollection", boundary: {type: "Polygon", coordinates: [[[0, 0]]]}, features: [{type: "Feature"}]};
const boundaryOnly = {type: "FeatureCollection", boundary: {type: "Polygon", coordinates: [[[0, 0]]]}, features: []};
const empty = {type: "FeatureCollection", features: []};

describe("keepsMoreMapData", () => {
    it("is false when the download would lose houses or the boundary the phone already has", () => {
        assert.isFalse(keepsMoreMapData(withHouses, boundaryOnly));
        assert.isFalse(keepsMoreMapData(withHouses, empty));
        assert.isFalse(keepsMoreMapData(boundaryOnly, empty));
    });

    it("is true for the first download, for same or more data, and when the old file is unreadable", () => {
        assert.isTrue(keepsMoreMapData(null, empty));
        assert.isTrue(keepsMoreMapData(boundaryOnly, withHouses));
        assert.isTrue(keepsMoreMapData(withHouses, withHouses));
        assert.isTrue(keepsMoreMapData("not json", empty));
    });
});
