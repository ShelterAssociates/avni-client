import _ from "lodash";
import {assert} from "chai";
import {Concept} from "avni-models";
import {
    DUPLICATES_FILTER_KEY, STATUS, applyConceptFilter, applyDuplicateFilter, applyFilter, buildFilterCatalog,
    buildStatusMap, canViewSubjectType, codedConceptsOnForm, duplicateCount,
} from "../../src/gis/mapData";
import {ANSWER_PALETTE} from "../../src/gis/colorCoding";

const YES = "yes-uuid", NO = "no-uuid";
const TOILET = {uuid: "toilet-uuid", name: "Do you have a toilet at home?", datatype: Concept.dataType.Coded,
    answers: [{concept: {uuid: YES}, answerOrder: 1}, {concept: {uuid: NO}, answerOrder: 2}]};
const OCCUPANCY = {uuid: "occ-uuid", name: "Type of structure occupancy", datatype: Concept.dataType.Coded, answers: []};
const conceptService = {getConceptByUUID: uuid => ({[YES]: {name: "Yes"}, [NO]: {name: "No"}}[uuid])};

function subject(uuid, firstName, answers = {}) {
    return {
        uuid, firstName,
        observations: _.map(answers, (value, conceptUuid) => ({
            concept: conceptUuid === TOILET.uuid ? TOILET : OCCUPANCY,
            getValueWrapper: () => ({getValue: () => value}),
        })),
    };
}

const subjects = [
    subject("a", "0001", {[TOILET.uuid]: NO}),
    subject("b", "0002", {[TOILET.uuid]: YES}),
    subject("c", "2", {[TOILET.uuid]: YES}),        // same house as "b", padded differently
    subject("d", "0003"),                             // no answers
];

describe("buildStatusMap", () => {
    it("marks a house registered once as registered and twice as duplicate", () => {
        const statusMap = buildStatusMap(subjects);
        assert.deepEqual(statusMap["1"], {status: STATUS.registered, uuids: ["a"], count: 1});
        assert.deepEqual(statusMap["2"], {status: STATUS.duplicate, uuids: ["b", "c"], count: 2});
        assert.equal(duplicateCount(statusMap), 1);
    });

    it("skips subjects without a house number", () => {
        assert.deepEqual(buildStatusMap([subject("x", ""), subject("y", null)]), {});
    });
});

describe("buildFilterCatalog", () => {
    const statusMap = buildStatusMap(subjects);

    it("offers a filter per coded question that has data in this slum, plus duplicates, in form order", () => {
        const filters = buildFilterCatalog({concepts: [OCCUPANCY, TOILET], subjects, conceptService, statusMap});
        assert.deepEqual(filters.map(f => f.key), [DUPLICATES_FILTER_KEY, TOILET.uuid]);
        assert.equal(filters[1].count, 3);
        assert.equal(filters[0].count, 1);
    });

    it("has no duplicates filter when there are none", () => {
        const one = [subjects[0]];
        const filters = buildFilterCatalog({concepts: [TOILET], subjects: one, conceptService, statusMap: buildStatusMap(one)});
        assert.deepEqual(filters.map(f => f.key), [TOILET.uuid]);
    });

    it("hides answer filters from users whose groups may not view the subject type", () => {
        const filters = buildFilterCatalog({concepts: [TOILET], subjects, conceptService, statusMap, canViewAnswers: false});
        assert.deepEqual(filters.map(f => f.key), [DUPLICATES_FILTER_KEY]);
    });
});

describe("canViewSubjectType", () => {
    const subjectType = {uuid: "st-1"};
    it("is true for users with all privileges", () => {
        assert.isTrue(canViewSubjectType({hasAllPrivileges: () => true}, subjectType));
    });
    it("otherwise needs the view-subject privilege for that subject type", () => {
        const service = {hasAllPrivileges: () => false, allowedEntityTypeUUIDListForCriteria: () => ["st-2"]};
        assert.isFalse(canViewSubjectType(service, subjectType));
        service.allowedEntityTypeUUIDListForCriteria = () => ["st-1", "st-2"];
        assert.isTrue(canViewSubjectType(service, subjectType));
    });
});

describe("codedConceptsOnForm", () => {
    it("takes top-level coded questions of the form, once each", () => {
        const form = {getFormElementsOfType: type => type === Concept.dataType.Coded ? [
            {concept: TOILET}, {concept: OCCUPANCY}, {concept: TOILET}, {concept: OCCUPANCY, groupUuid: "qg-1"},
        ] : []};
        assert.deepEqual(codedConceptsOnForm(form).map(c => c.uuid), [TOILET.uuid, OCCUPANCY.uuid]);
        assert.deepEqual(codedConceptsOnForm(null), []);
    });
});

describe("applyConceptFilter", () => {
    it("maps each structure to its answer and colours answers in concept order", () => {
        const {answerByKey, answerColors} = applyConceptFilter({subjects, concept: TOILET, conceptService});
        assert.deepEqual(answerByKey, {"1": "No", "2": "Yes"});
        assert.deepEqual(answerColors, {Yes: ANSWER_PALETTE[0], No: ANSWER_PALETTE[1]});
    });

    it("leaves structures without an answer out of the map", () => {
        const {answerByKey} = applyConceptFilter({subjects, concept: TOILET, conceptService});
        assert.notProperty(answerByKey, "3");
    });
});

describe("applyDuplicateFilter", () => {
    it("labels duplicate structures by how many households share them", () => {
        const many = [...subjects, subject("e", "1"), subject("f", "01")];
        const {answerByKey, answerColors} = applyDuplicateFilter(buildStatusMap(many));
        assert.deepEqual(answerByKey, {"1": "3 registrations", "2": "2 registrations"});
        assert.deepEqual(_.keys(answerColors), ["2 registrations", "3 registrations"]);
    });

    it("dispatches by filter kind", () => {
        const statusMap = buildStatusMap(subjects);
        assert.deepEqual(applyFilter({kind: "duplicates"}, {subjects, conceptService, statusMap}).answerByKey, {"2": "2 registrations"});
        assert.deepEqual(applyFilter({kind: "concept", concept: TOILET}, {subjects, conceptService, statusMap}).answerByKey, {"1": "No", "2": "Yes"});
    });
});
