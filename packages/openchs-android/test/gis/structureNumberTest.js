import {assert} from "chai";
import {structureKey, STRUCTURE_KEY_SOURCE, isBlankStructure} from "../../src/gis/structureNumber";

describe("structureKey", () => {
    it("drops leading zeros from numeric ids", () => {
        assert.equal(structureKey("0035"), "35");
        assert.equal(structureKey("35"), "35");
        assert.equal(structureKey("0001"), "1");
        assert.equal(structureKey(35), "35");
    });

    it("keeps a zero id as zero", () => {
        assert.equal(structureKey("0"), "0");
        assert.equal(structureKey("0000"), "0");
    });

    it("keeps alphanumeric suffixes", () => {
        assert.equal(structureKey("0022A"), "22A");
        assert.equal(structureKey("22A"), "22A");
        assert.equal(structureKey("0022 A"), "22A");
    });

    it("leaves non-numeric ids alone", () => {
        assert.equal(structureKey("R1"), "R1");
        assert.equal(structureKey("plot-7"), "plot-7");
    });

    it("trims whitespace", () => {
        assert.equal(structureKey("  35 "), "35");
    });

    it("is empty for empty, null and undefined", () => {
        assert.equal(structureKey(""), "");
        assert.equal(structureKey("   "), "");
        assert.equal(structureKey(null), "");
        assert.equal(structureKey(undefined), "");
        assert.isTrue(isBlankStructure(null));
        assert.isFalse(isBlankStructure("0001"));
    });

    it("agrees with itself when re-evaluated from its own source inside a plain script", () => {
        // This is exactly what buildMapHTML does inside the WebView.
        const inWebView = new Function(`${STRUCTURE_KEY_SOURCE}; return structureKey;`)();
        ["0035", "22A", " 7 ", "R1", null].forEach(v => assert.equal(inWebView(v), structureKey(v)));
        assert.match(STRUCTURE_KEY_SOURCE, /^function structureKey\(/);
    });
});
