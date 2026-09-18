import {assert} from "chai";
import {Concept} from "avni-models";
import {householdSummary} from "../../src/gis/householdSummary";

const TOILET = {uuid: "t", name: "Do you have a toilet at home?", datatype: Concept.dataType.Coded, answers: []};
const conceptService = {getConceptByUUID: () => ({name: "Yes"})};
const individual = {
    uuid: "a", firstName: "0035", lastName: "Pawar", registrationDate: new Date("2026-03-02T00:00:00Z"),
    observations: [{concept: TOILET, getValueWrapper: () => ({getValue: () => "yes-uuid"})}],
};

describe("householdSummary", () => {
    it("shows who lives there, the house number and the answers to the map's concepts", () => {
        const summary = householdSummary(individual, [TOILET], conceptService);
        assert.equal(summary.number, "35");
        assert.equal(summary.name, "Pawar");
        assert.equal(summary.registeredOn, "2026-03-02");
        assert.deepEqual(summary.answers, [{label: "Do you have a toilet at home?", value: "Yes"}]);
    });

    it("skips concepts the household has not answered", () => {
        const summary = householdSummary({...individual, observations: []}, [TOILET], conceptService);
        assert.deepEqual(summary.answers, []);
    });
});
