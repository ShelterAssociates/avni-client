import _ from "lodash";
import {assert} from "chai";
import {Concept} from "avni-models";
import {
    DUPLICATES_FILTER_KEY, STATUS, answerTable, applyConceptFilter, applyDuplicateFilter, applyFilter, buildFilterCatalog,
    buildStatusMap, canViewSubjectType, codedConceptsOnForm, codedConceptsOnForms, duplicateCount,
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

    it("offers a filter per coded question that has data in this slum, plus duplicates, in form order", async () => {
        const {filters} = await buildFilterCatalog({concepts: [OCCUPANCY, TOILET], subjects, conceptService, statusMap});
        assert.deepEqual(filters.map(f => f.key), [DUPLICATES_FILTER_KEY, TOILET.uuid]);
        assert.equal(filters[1].count, 3);
        assert.equal(filters[0].count, 1);
    });

    it("puts the concepts chosen on the GIS server first and still offers the rest", async () => {
        const withOccupancy = [...subjects, subject("z", "0009", {[OCCUPANCY.uuid]: YES})];
        const mapFilters = [{concept_uuid: OCCUPANCY.uuid, concept_name: OCCUPANCY.name}];
        const {filters} = await buildFilterCatalog({concepts: [TOILET, OCCUPANCY], subjects: withOccupancy, conceptService, statusMap, mapFilters});
        assert.deepEqual(filters.filter(f => f.kind === "concept").map(f => f.key), [OCCUPANCY.uuid, TOILET.uuid]);
    });

    it("matches a chosen concept by name when the server has no uuid for it", async () => {
        const {filters} = await buildFilterCatalog({concepts: [OCCUPANCY, TOILET], subjects, conceptService, statusMap,
            mapFilters: [{concept_uuid: "", concept_name: " do you have a toilet at home? "}]});
        assert.deepEqual(filters.filter(f => f.kind === "concept").map(f => f.key), [TOILET.uuid]);
    });

    it("has no duplicates filter when there are none", async () => {
        const one = [subjects[0]];
        const {filters} = await buildFilterCatalog({concepts: [TOILET], subjects: one, conceptService, statusMap: buildStatusMap(one)});
        assert.deepEqual(filters.map(f => f.key), [TOILET.uuid]);
    });

    it("hides answer filters from users whose groups may not view the subject type", async () => {
        const {filters} = await buildFilterCatalog({concepts: [TOILET], subjects, conceptService, statusMap, canViewAnswers: false});
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

describe("answers given in visits", () => {
    const VISIT_Q = {uuid: "visit-uuid", name: "Toilet in use?", datatype: Concept.dataType.Coded, answers: []};
    const visited = {...subject("v", "0007"), encounters: [{voided: false, encounterDateTime: new Date("2026-02-01"),
        observations: [{concept: VISIT_Q, getValueWrapper: () => ({getValue: () => YES})}]}]};

    it("count towards the filter catalogue and colour the structure", async () => {
        const all = [...subjects, visited];
        const {filters} = await buildFilterCatalog({concepts: [VISIT_Q], subjects: all, conceptService, statusMap: buildStatusMap(all)});
        assert.deepEqual(filters.filter(f => f.kind === "concept").map(f => [f.key, f.count]), [[VISIT_Q.uuid, 1]]);
        assert.deepEqual(applyConceptFilter({table: await answerTable(all, [VISIT_Q]), concept: VISIT_Q, conceptService}).answerByKey, {"7": "Yes"});
    });
});

describe("answerTable", () => {
    it("holds each household's raw answers per concept, read in chunks, yielding between them", async () => {
        const all = [...subjects, subject("z", "0009", {[OCCUPANCY.uuid]: YES})];
        let ticks = 0;
        const table = await answerTable(all, [TOILET, OCCUPANCY], {chunk: 2, yieldFn: () => { ticks++; return Promise.resolve(); }});
        assert.equal(table.length, all.length);
        assert.deepEqual(table[0], {key: "1", values: {[TOILET.uuid]: NO}});
        assert.deepEqual(_.last(table).values, {[OCCUPANCY.uuid]: YES});
        assert.equal(ticks, Math.ceil(all.length / 2) - 1);
    });
});

describe("codedConceptsOnForms", () => {
    const form = (...concepts) => ({getFormElementsOfType: () => concepts.map(concept => ({concept}))});
    it("unions the coded concepts of every form, keeping each concept once in first-seen order", () => {
        const concepts = codedConceptsOnForms([form(TOILET, OCCUPANCY), null, form(OCCUPANCY, {uuid: "x", name: "X"})]);
        assert.deepEqual(concepts.map(c => c.uuid), [TOILET.uuid, OCCUPANCY.uuid, "x"]);
    });
});

describe("applyConceptFilter", () => {
    it("maps each structure to its answer and colours answers in concept order", async () => {
        const table = await answerTable(subjects, [TOILET]);
        const {answerByKey, answerColors} = applyConceptFilter({table, concept: TOILET, conceptService});
        assert.deepEqual(answerByKey, {"1": "No", "2": "Yes"});
        assert.deepEqual(answerColors, {Yes: ANSWER_PALETTE[0], No: ANSWER_PALETTE[1]});
    });

    it("leaves structures without an answer out of the map", async () => {
        const {answerByKey} = applyConceptFilter({table: await answerTable(subjects, [TOILET]), concept: TOILET, conceptService});
        assert.notProperty(answerByKey, "3");
    });

    it("colours answers the GIS server has a filter for in the website's colour", async () => {
        const filterStyles = [{name: "Has toilet", concepts: [TOILET.name], answers: ["yes"], polycolor: "#00AA00", linecolor: null}];
        const table = await answerTable(subjects, [TOILET]);
        const {answerColors} = applyFilter({kind: "concept", concept: TOILET}, {table, conceptService, statusMap: {}, filterStyles});
        assert.deepEqual(answerColors, {Yes: "#00AA00", No: ANSWER_PALETTE[0]});
    });
});

describe("applyDuplicateFilter", () => {
    it("labels duplicate structures by how many households share them", () => {
        const many = [...subjects, subject("e", "1"), subject("f", "01")];
        const {answerByKey, answerColors} = applyDuplicateFilter(buildStatusMap(many));
        assert.deepEqual(answerByKey, {"1": "3 registrations", "2": "2 registrations"});
        assert.deepEqual(_.keys(answerColors), ["2 registrations", "3 registrations"]);
    });

    it("dispatches by filter kind", async () => {
        const statusMap = buildStatusMap(subjects);
        const table = await answerTable(subjects, [TOILET]);
        assert.deepEqual(applyFilter({kind: "duplicates"}, {table, conceptService, statusMap}).answerByKey, {"2": "2 registrations"});
        assert.deepEqual(applyFilter({kind: "concept", concept: TOILET}, {table, conceptService, statusMap}).answerByKey, {"1": "No", "2": "Yes"});
    });
});
