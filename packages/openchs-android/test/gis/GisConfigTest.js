import {assert} from "chai";

jest.mock("../../src/framework/Config", () => ({}), {virtual: true});
const Config = require("../../src/framework/Config");
const {default: GisConfig, GIS_API_KEY_HEADER} = require("../../src/gis/GisConfig");

describe("GisConfig", () => {
    beforeEach(() => {
        delete Config.GIS_SERVER_URL;
        delete Config.GIS_API_KEY;
        global.fetch = jest.fn(() => Promise.resolve({ok: true}));
    });

    it("is not configured until both the url and the key are set", () => {
        assert.isFalse(GisConfig.isConfigured());
        Config.GIS_SERVER_URL = "http://gis.example.org";
        assert.isFalse(GisConfig.isConfigured());
        Config.GIS_API_KEY = "secret";
        assert.isTrue(GisConfig.isConfigured());
    });

    it("treats blank values as unset", () => {
        Config.GIS_SERVER_URL = "  ";
        Config.GIS_API_KEY = "";
        assert.isFalse(GisConfig.isConfigured());
        assert.equal(GisConfig.serverUrl, "");
    });

    it("builds urls without a double slash", () => {
        Config.GIS_SERVER_URL = "http://gis.example.org/";
        assert.equal(GisConfig.url("/component/x/"), "http://gis.example.org/component/x/");
    });

    it("attaches the key header to every request and keeps caller headers", async () => {
        Config.GIS_SERVER_URL = "http://gis.example.org";
        Config.GIS_API_KEY = "secret";
        await GisConfig.fetch("/component/x/", {method: "POST", headers: {"Content-Type": "application/json"}});
        const [url, options] = global.fetch.mock.calls[0];
        assert.equal(url, "http://gis.example.org/component/x/");
        assert.equal(options.method, "POST");
        assert.equal(options.headers[GIS_API_KEY_HEADER], "secret");
        assert.equal(options.headers["Content-Type"], "application/json");
    });
});
