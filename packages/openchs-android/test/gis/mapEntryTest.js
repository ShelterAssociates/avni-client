import {assert} from "chai";
import {mapEntry} from "../../src/gis/mapEntry";
import GisConfig from "../../src/gis/GisConfig";

const addressLevelService = slums => ({findAllByCriteria: () => slums.map(name => ({uuid: name.toLowerCase(), name}))});

describe("mapEntry", () => {
    beforeEach(() => GisConfig.override({GIS_SERVER_URL: "https://gis", GIS_API_KEY: "k"}));
    afterEach(() => GisConfig.override(null));

    it("offers the map when the GIS server is configured and a slum is synced, slums sorted by name", () => {
        const entry = mapEntry(addressLevelService(["Kala Nagar", "Alase Slum"]));
        assert.isTrue(entry.available);
        assert.deepEqual(entry.slums.map(s => s.name), ["Alase Slum", "Kala Nagar"]);
    });

    it("hides the map without slums or without a GIS server", () => {
        assert.isFalse(mapEntry(addressLevelService([])).available);
        GisConfig.override({});
        assert.isFalse(mapEntry(addressLevelService(["Alase Slum"])).available);
    });
});
