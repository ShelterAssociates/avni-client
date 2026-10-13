import {assert} from "chai";
import {isStructureCollection, slumFileName} from "../../src/gis/gisFile";

describe("isStructureCollection", () => {
    it("accepts a slum file, however little it carries", () => {
        assert.isTrue(isStructureCollection({type: "FeatureCollection", features: [{}], boundary: {coordinates: [[]]}}));
        assert.isTrue(isStructureCollection({type: "FeatureCollection", features: [], boundary: null}));
    });

    it("refuses anything that is not one, so a bad response cannot replace good structures", () => {
        assert.isFalse(isStructureCollection(null));
        assert.isFalse(isStructureCollection("not json"));
        assert.isFalse(isStructureCollection({error: "no slum is mapped to avni_uuid x"}));
        assert.isFalse(isStructureCollection({type: "FeatureCollection"}));
        assert.isFalse(isStructureCollection({type: "Feature", features: []}));
    });
});

describe("slumFileName", () => {
    it("is the same name sync writes and the map reads", () => {
        assert.equal(slumFileName("abc-123"), "structures_abc-123.json");
    });
});
