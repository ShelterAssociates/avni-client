import {assert} from "chai";
import {Concept} from "avni-models";
import {householdSummary, recentHouseholds} from "../../src/gis/householdSummary";

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

describe("recentHouseholds", () => {
    const subjects = [
        {uuid: "a", firstName: "0035", lastName: "Pawar", registrationDate: new Date("2026-03-02T00:00:00Z")},
        {uuid: "b", firstName: "0007", lastName: "Shinde", registrationDate: new Date("2026-04-11T00:00:00Z")},
        {uuid: "c", firstName: "0012", lastName: "", registrationDate: null},
    ];

    it("lists the newest registrations first, with the number as the map spells it", () => {
        assert.deepEqual(recentHouseholds(subjects), [
            {uuid: "b", number: "7", name: "Shinde", registeredOn: "2026-04-11"},
            {uuid: "a", number: "35", name: "Pawar", registeredOn: "2026-03-02"},
            {uuid: "c", number: "12", name: "", registeredOn: null},
        ]);
    });

    it("takes at most the asked-for count", () => {
        assert.deepEqual(recentHouseholds(subjects, 1).map(h => h.uuid), ["b"]);
        assert.deepEqual(recentHouseholds([], 5), []);
    });
});
