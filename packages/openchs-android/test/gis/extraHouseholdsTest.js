import {assert} from "chai";
import {
    EXTRA_BLANK, EXTRA_ON_MAP, EXTRA_TAKEN, extraHouseholds, structureKeys, validateExtraHouse,
} from "../../src/gis/extraHouseholds";

const geojson = {features: [{properties: {s: "0001"}}, {properties: {s: "2"}}, {properties: {s: "0022 A"}}]};
const onMap = structureKeys(geojson);
const statusMap = {"1": {uuids: ["a"], count: 1}, "99": {uuids: ["b"], count: 1}, "100A": {uuids: ["c"], count: 1}};

describe("structureKeys", () => {
    it("normalises every house number the map draws", () => {
        assert.deepEqual(onMap, ["1", "2", "22A"]);
    });
});

describe("extraHouseholds", () => {
    it("lists only households whose number is not a structure", () => {
        assert.deepEqual(extraHouseholds(statusMap, onMap).map(h => h.key), ["99", "100A"]);
    });

    it("is empty when every household sits on a structure", () => {
        assert.deepEqual(extraHouseholds({"1": {count: 1}}, onMap), []);
    });
});

describe("validateExtraHouse", () => {
    it("accepts a number that is neither on the map nor already registered", () => {
        assert.deepEqual(validateExtraHouse("0101", statusMap, onMap), {ok: true, key: "101"});
    });

    it("refuses a number the map already has, however it is typed", () => {
        assert.equal(validateExtraHouse("0002", statusMap, onMap).reason, EXTRA_ON_MAP);
        assert.equal(validateExtraHouse("22 A", statusMap, onMap).reason, EXTRA_ON_MAP);
    });

    it("refuses a number another household already uses", () => {
        assert.equal(validateExtraHouse("0099", statusMap, onMap).reason, EXTRA_TAKEN);
    });

    it("refuses nothing typed", () => {
        assert.equal(validateExtraHouse("   ", statusMap, onMap).reason, EXTRA_BLANK);
        assert.equal(validateExtraHouse(null, statusMap, onMap).reason, EXTRA_BLANK);
    });
});
