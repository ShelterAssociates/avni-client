import _ from "lodash";
import {assert} from "chai";
import {
    ANSWER_PALETTE, STATUS_COLORS, assignAnswerColors, orderAnswerLabels, statusLegend, answerLegend, duplicateLabel,
} from "../../src/gis/colorCoding";

describe("assignAnswerColors", () => {
    it("gives each answer the next palette colour in the order given", () => {
        const colors = assignAnswerColors(["Owner", "Tenant", "Encroacher"]);
        assert.deepEqual(colors, {Owner: ANSWER_PALETTE[0], Tenant: ANSWER_PALETTE[1], Encroacher: ANSWER_PALETTE[2]});
    });

    it("wraps round the palette when there are more answers than colours", () => {
        const labels = _.range(ANSWER_PALETTE.length + 3).map(i => `answer ${i}`);
        const colors = assignAnswerColors(labels);
        assert.equal(_.size(colors), labels.length);
        assert.equal(colors["answer 0"], ANSWER_PALETTE[0]);
        assert.equal(colors[`answer ${ANSWER_PALETTE.length}`], ANSWER_PALETTE[0]);
        assert.equal(colors[`answer ${ANSWER_PALETTE.length + 2}`], ANSWER_PALETTE[2]);
    });

    it("ignores duplicates and nulls without consuming colours", () => {
        const colors = assignAnswerColors(["Yes", null, "Yes", "No"]);
        assert.deepEqual(colors, {Yes: ANSWER_PALETTE[0], No: ANSWER_PALETTE[1]});
    });

    it("is empty for no answers", () => {
        assert.deepEqual(assignAnswerColors([]), {});
    });
});

describe("orderAnswerLabels", () => {
    it("puts the concept's own answers first, in concept order, then the rest as discovered", () => {
        const ordered = orderAnswerLabels(["Shared", "No + Shared", "Yes", "Yes + Shared"], ["Yes", "No", "Shared"]);
        assert.deepEqual(ordered, ["Yes", "Shared", "No + Shared", "Yes + Shared"]);
    });

    it("drops concept answers nobody gave", () => {
        assert.deepEqual(orderAnswerLabels(["No"], ["Yes", "No"]), ["No"]);
    });

    it("works without concept answers (text / numeric / duplicate filters)", () => {
        assert.deepEqual(orderAnswerLabels(["3", "2", "3"]), ["3", "2"]);
    });
});

describe("legends", () => {
    it("status legend uses the status colours and includes the duplicate status", () => {
        const legend = statusLegend();
        assert.deepEqual(legend.map(row => row.key), ["notSurveyed", "registered", "duplicate", "selected", "searchHit"]);
        legend.forEach(row => assert.equal(row.color, STATUS_COLORS[row.key].fill));
    });

    it("answer legend is derived from the colour map plus the no-data row", () => {
        const colors = assignAnswerColors(["Yes", "No"]);
        const legend = answerLegend(colors);
        assert.deepEqual(legend.map(row => [row.label, row.color]), [
            ["Yes", ANSWER_PALETTE[0]], ["No", ANSWER_PALETTE[1]], [STATUS_COLORS.noData.label, STATUS_COLORS.noData.fill],
        ]);
    });

    it("every status colour is a hex value with a label", () => {
        _.forEach(STATUS_COLORS, entry => {
            assert.match(entry.fill, /^#[0-9a-fA-F]{6}$/);
            assert.match(entry.stroke, /^#[0-9a-fA-F]{6}$/);
            assert.isString(entry.label);
        });
    });

    it("duplicate labels read as counts", () => {
        assert.equal(duplicateLabel(2), "2 registrations");
    });
});
