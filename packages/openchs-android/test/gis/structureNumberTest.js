import {assert} from "chai";
import {structureKey, STRUCTURE_KEY_SOURCE, isBlankStructure, formatHouseholdNumber} from "../../src/gis/structureNumber";

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

    it("does not depend on Function.prototype.toString, which Hermes cannot provide", () => {
        const original = Function.prototype.toString;
        Function.prototype.toString = function () { return `function ${this.name}() { [bytecode] }`; };
        let hermesModule;
        try {
            jest.isolateModules(() => { hermesModule = require("../../src/gis/structureNumber"); });
        } finally {
            Function.prototype.toString = original;
        }
        const inWebView = new Function(`${hermesModule.STRUCTURE_KEY_SOURCE}; return structureKey;`)();
        assert.equal(inWebView("0035"), "35");
        assert.equal(inWebView("0022 A"), "22A");
    });
});

describe("formatHouseholdNumber", () => {
    it("pads a numeric house number to 4 digits", () => {
        assert.equal(formatHouseholdNumber("1"), "0001");
        assert.equal(formatHouseholdNumber("12"), "0012");
        assert.equal(formatHouseholdNumber("123"), "0123");
        assert.equal(formatHouseholdNumber("1234"), "1234");
        assert.equal(formatHouseholdNumber(35), "0035");
    });

    it("pads the numeric part of a house number with a letter suffix", () => {
        assert.equal(formatHouseholdNumber("1A"), "0001A");
        assert.equal(formatHouseholdNumber("12A"), "0012A");
        assert.equal(formatHouseholdNumber("123A"), "0123A");
        assert.equal(formatHouseholdNumber("1234A"), "1234A");
        assert.equal(formatHouseholdNumber("12B"), "0012B");
    });

    it("does not touch a number already at or beyond its padded width", () => {
        assert.equal(formatHouseholdNumber("12345"), "12345");
    });

    it("leaves non-numeric ids alone", () => {
        assert.equal(formatHouseholdNumber("R1"), "R1");
        assert.equal(formatHouseholdNumber("plot-7"), "plot-7");
    });

    it("is empty for empty, null and undefined", () => {
        assert.equal(formatHouseholdNumber(""), "");
        assert.equal(formatHouseholdNumber("   "), "");
        assert.equal(formatHouseholdNumber(null), "");
        assert.equal(formatHouseholdNumber(undefined), "");
    });
});
