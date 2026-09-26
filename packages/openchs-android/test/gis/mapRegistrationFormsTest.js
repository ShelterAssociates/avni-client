import {assert} from "chai";
import {registrationUsesMap} from "../../src/gis/mapRegistrationForms";

describe("registrationUsesMap", () => {
    it("sends only the subject types chosen on the GIS server through the map", () => {
        const chosen = ["Detailed Socio Economic Survey", "Short Survey"];
        assert.isTrue(registrationUsesMap("Detailed Socio Economic Survey", chosen));
        assert.isTrue(registrationUsesMap("Short Survey", chosen));
        assert.isFalse(registrationUsesMap("Household", chosen));
        assert.isFalse(registrationUsesMap("Toilet", chosen));
    });

    it("keeps the map in front of every registration until any are chosen", () => {
        assert.isTrue(registrationUsesMap("Household", []));
        assert.isTrue(registrationUsesMap("Household", null));
        assert.isTrue(registrationUsesMap("Household", undefined));
    });
});
