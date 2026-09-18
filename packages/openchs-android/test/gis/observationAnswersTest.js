import {assert} from "chai";
import {Concept} from "avni-models";
import {answerLabels, combinedAnswerLabel, findObservation} from "../../src/gis/observationAnswers";

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

describe("findObservation", () => {
    const observations = [{concept: {uuid: "c1", name: "A"}}, {concept: {uuid: "c2", name: "B"}}];

    it("matches by uuid when given, else by name", () => {
        assert.equal(findObservation(observations, {uuid: "c2"}).concept.name, "B");
        assert.equal(findObservation(observations, {name: "A"}).concept.uuid, "c1");
        assert.isNull(findObservation(observations, {name: "Z"}));
        assert.isNull(findObservation(null, {name: "A"}));
    });
});
