import {assert} from "chai";
import {Concept} from "avni-models";
import {answerIndex, answerLabels, combinedAnswerLabel, hasAnswer, subjectObservations} from "../../src/gis/observationAnswers";

const YES = "11111111-1111-1111-1111-111111111111";
const NO = "22222222-2222-2222-2222-222222222222";
const SHARED = "33333333-3333-3333-3333-333333333333";
const conceptService = {
    getConceptByUUID: uuid => ({[YES]: {name: "Yes"}, [NO]: {name: "No"}, [SHARED]: {name: "Shared"}}[uuid]),
};

function coded(value, answers = [[YES, 1], [NO, 2], [SHARED, 3]]) {
    return {
        concept: {
            name: "Toilet", datatype: Concept.dataType.Coded,
            answers: answers.map(([uuid, answerOrder]) => ({concept: {uuid}, answerOrder})),
        },
        getValueWrapper: () => ({getValue: () => value}),
    };
}

function primitive(datatype, value) {
    return {concept: {name: "Q", datatype}, getValueWrapper: () => ({getValue: () => value})};
}

describe("answerLabels", () => {
    it("resolves a single-select coded answer to its concept name", () => {
        assert.deepEqual(answerLabels(coded(YES), conceptService), ["Yes"]);
    });

    it("resolves every multi-select answer, in the concept's answer order", () => {
        assert.deepEqual(answerLabels(coded([SHARED, YES]), conceptService), ["Yes", "Shared"]);
    });

    it("falls back to the uuid when the answer concept is unknown", () => {
        assert.deepEqual(answerLabels(coded("unknown-uuid"), conceptService), ["unknown-uuid"]);
    });

    it("uses the datatype, not the value's shape, to decide what is coded", () => {
        const looksLikeUuid = "a-long-hyphenated-free-text-answer-that-is-not-a-uuid";
        assert.deepEqual(answerLabels(primitive(Concept.dataType.Text, looksLikeUuid), conceptService), [looksLikeUuid]);
        assert.deepEqual(answerLabels(primitive(Concept.dataType.Numeric, 35), conceptService), ["35"]);
        assert.deepEqual(answerLabels(primitive(Concept.dataType.Numeric, 0), conceptService), ["0"]);
    });

    it("is empty for missing observations and empty values", () => {
        assert.deepEqual(answerLabels(null, conceptService), []);
        assert.deepEqual(answerLabels(primitive(Concept.dataType.Text, ""), conceptService), []);
        assert.deepEqual(answerLabels(primitive(Concept.dataType.Numeric, null), conceptService), []);
        assert.deepEqual(answerLabels(coded([]), conceptService), []);
    });
});

describe("combinedAnswerLabel", () => {
    it("joins multi-select answers so each combination is its own colour", () => {
        assert.equal(combinedAnswerLabel(["Yes", "Shared"]), "Yes + Shared");
        assert.equal(combinedAnswerLabel(["Yes"]), "Yes");
        assert.isNull(combinedAnswerLabel([]));
    });
});

describe("subjectObservations", () => {
    const obs = name => ({concept: {uuid: name, name}});
    const household = {
        observations: [obs("registration")],
        enrolments: [
            {voided: false, observations: [obs("enrolment")], encounters: [
                {voided: false, encounterDateTime: new Date("2026-01-05"), observations: [obs("older visit")]},
                {voided: false, encounterDateTime: new Date("2026-03-01"), observations: [obs("latest visit")]},
                {voided: true, encounterDateTime: new Date("2026-04-01"), observations: [obs("voided visit")]},
            ]},
            {voided: true, observations: [obs("voided enrolment")], encounters: []},
        ],
        encounters: [{voided: false, encounterDateTime: new Date("2026-02-01"), observations: [obs("general visit")]}],
    };

    it("lists registration, then enrolment, then visit answers with the newest visit first, skipping voided ones", () => {
        assert.deepEqual(subjectObservations(household).map(o => o.concept.name),
            ["registration", "enrolment", "latest visit", "general visit", "older visit"]);
    });

    it("copes with a household that has no enrolments or visits", () => {
        assert.deepEqual(subjectObservations({observations: [obs("registration")]}).map(o => o.concept.name), ["registration"]);
    });
});

describe("answerIndex / hasAnswer", () => {
    const obs = (uuid, value) => ({concept: {uuid, name: uuid, datatype: Concept.dataType.Text}, getValueWrapper: () => ({getValue: () => value})});
    const household = {
        observations: [obs("a", "registration answer"), obs("b", "")],
        enrolments: [], encounters: [{voided: false, encounterDateTime: new Date("2026-02-01"), observations: [obs("a", "visit answer"), obs("c", "visit only")]}],
    };

    it("keeps the first observation per concept in subjectObservations order", () => {
        const index = answerIndex(household);
        assert.deepEqual(Object.keys(index).sort(), ["a", "b", "c"]);
        assert.equal(index.a.getValueWrapper().getValue(), "registration answer");
        assert.equal(index.c.getValueWrapper().getValue(), "visit only");
    });

    it("can be limited to registration answers, which skips reading visits", () => {
        assert.deepEqual(Object.keys(answerIndex(household, {registrationOnly: true})).sort(), ["a", "b"]);
    });

    it("hasAnswer is false for empty, null, [] and missing observations", () => {
        assert.isTrue(hasAnswer(obs("a", "x")));
        assert.isTrue(hasAnswer(obs("a", ["u1"])));
        assert.isFalse(hasAnswer(obs("a", "")));
        assert.isFalse(hasAnswer(obs("a", null)));
        assert.isFalse(hasAnswer(obs("a", [])));
        assert.isFalse(hasAnswer(null));
    });
});
