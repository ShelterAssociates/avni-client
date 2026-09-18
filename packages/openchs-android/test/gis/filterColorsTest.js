import {assert} from "chai";
import {presetAnswerColors} from "../../src/gis/filterColors";

const filters = [
    {name: "Has own toilet", concepts: ["Current place of defecation", "Final current place of defecation"],
        answers: ["Own toilet", "Shared toilet"], polycolor: "#00AA00", linecolor: "#004400"},
    {name: "Open defecation", concepts: ["Current place of defecation"], answers: ["Open"], polycolor: "#AA0000", linecolor: null},
    {name: "Rented", concepts: ["Ownership status of the house_1"], answers: ["Rented"], polycolor: "#0000AA", linecolor: null},
];

describe("presetAnswerColors", () => {
    it("collects the website colours of every filter on the concept", () => {
        assert.deepEqual(presetAnswerColors(filters, "Current place of defecation"),
            {"Own toilet": "#00AA00", "Shared toilet": "#00AA00", "Open": "#AA0000"});
        assert.deepEqual(presetAnswerColors(filters, "Final current place of defecation"),
            {"Own toilet": "#00AA00", "Shared toilet": "#00AA00"});
    });

    it("matches concept and answer names ignoring case and surrounding spaces", () => {
        assert.deepEqual(presetAnswerColors(filters, " ownership status of the HOUSE_1 "), {Rented: "#0000AA"});
    });

    it("is empty for a concept the metadata does not cover, or a file from an older server", () => {
        assert.deepEqual(presetAnswerColors(filters, "Type of shop"), {});
        assert.deepEqual(presetAnswerColors(undefined, "Type of shop"), {});
    });
});
